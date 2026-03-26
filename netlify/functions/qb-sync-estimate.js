// =============================================
// QUICKBOOKS SYNC ESTIMATE - Create estimate in QB from quote
// =============================================

const { qbRequest, supabase } = require('./qb-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
  }

  try {
    const { quoteId } = JSON.parse(event.body);

    if (!quoteId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Quote ID required' })
      };
    }

    // Get quote with customer
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*, customers(*)')
      .eq('id', quoteId)
      .single();

    if (quoteError || !quote) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Quote not found' })
      };
    }

    // Idempotency: early return if already synced
    if (quote.qb_estimate_id) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          qb_estimate_id: quote.qb_estimate_id,
          message: 'Estimate already synced to QuickBooks'
        })
      };
    }

    const customer = quote.customers;
    if (!customer) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Quote has no associated customer' })
      };
    }

    // Ensure customer is synced to QB first
    let qbCustomerId = customer.qb_customer_id;
    if (!qbCustomerId) {
      const custResult = await syncCustomer(customer);
      qbCustomerId = custResult.qb_customer_id;

      await supabase
        .from('customers')
        .update({ qb_customer_id: qbCustomerId })
        .eq('id', customer.id);
    }

    // Get quote line items
    const { data: lineItems } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order');

    // Build QB estimate
    const qbEstimate = {
      CustomerRef: { value: qbCustomerId },
      DocNumber: quote.quote_number,
      TxnDate: quote.created_at ? quote.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      ExpirationDate: quote.expires_at ? quote.expires_at.split('T')[0] : undefined,
      Line: []
    };

    // Remove undefined fields
    if (!qbEstimate.ExpirationDate) delete qbEstimate.ExpirationDate;

    // Add line items (non-optional, or optional+selected)
    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        const include = !item.is_optional || item.is_selected;
        if (!include) continue;

        qbEstimate.Line.push({
          DetailType: 'SalesItemLineDetail',
          Amount: (item.quantity || 1) * (item.unit_price || 0),
          Description: item.description || '',
          SalesItemLineDetail: {
            Qty: item.quantity || 1,
            UnitPrice: item.unit_price || 0
          }
        });
      }
    } else {
      // If no line items, create single line from quote total
      qbEstimate.Line.push({
        DetailType: 'SalesItemLineDetail',
        Amount: quote.subtotal || quote.total || 0,
        Description: quote.title || 'Services',
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: quote.subtotal || quote.total || 0
        }
      });
    }

    // Add tax as separate line if present
    if (quote.tax_amount && quote.tax_amount > 0) {
      qbEstimate.Line.push({
        DetailType: 'SalesItemLineDetail',
        Amount: quote.tax_amount,
        Description: 'Sales Tax',
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: quote.tax_amount
        }
      });
    }

    // Create estimate in QuickBooks
    const result = await qbRequest('POST', '/estimate', qbEstimate);
    const qbEstimateId = result.Estimate.Id;

    // Update our quote with QB ID
    await supabase
      .from('quotes')
      .update({
        qb_estimate_id: qbEstimateId,
        qb_synced_at: new Date().toISOString()
      })
      .eq('id', quoteId);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        success: true,
        qb_estimate_id: qbEstimateId,
        message: 'Estimate created in QuickBooks'
      })
    };

  } catch (err) {
    console.error('QB sync estimate error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message })
    };
  }
};

// Helper to sync customer if not already synced
async function syncCustomer(customer) {
  // Check if customer with this email already exists in QB
  let existingQBCustomer = null;
  if (customer.email) {
    try {
      const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${customer.email.replace(/'/g, "\\'")}'`;
      const searchResult = await qbRequest('GET', `/query?query=${encodeURIComponent(query)}`);
      if (searchResult.QueryResponse?.Customer?.length > 0) {
        existingQBCustomer = searchResult.QueryResponse.Customer[0];
      }
    } catch (e) {
      console.log('Customer search failed:', e.message);
    }
  }

  if (existingQBCustomer) {
    return { qb_customer_id: existingQBCustomer.Id };
  }

  // Create new customer
  const nameParts = (customer.name || '').trim().split(' ');
  const qbCustomer = {
    DisplayName: customer.name || customer.email || 'Unknown Customer',
    GivenName: nameParts[0] || undefined,
    FamilyName: nameParts.slice(1).join(' ') || undefined,
    PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
    PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
    BillAddr: customer.address ? { Line1: customer.address } : undefined
  };

  Object.keys(qbCustomer).forEach(key => {
    if (qbCustomer[key] === undefined) delete qbCustomer[key];
  });

  const result = await qbRequest('POST', '/customer', qbCustomer);
  return { qb_customer_id: result.Customer.Id };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
