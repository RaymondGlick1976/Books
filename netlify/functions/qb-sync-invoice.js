// =============================================
// QUICKBOOKS SYNC INVOICE - Create invoice in QB
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
    const { invoiceId } = JSON.parse(event.body);
    
    if (!invoiceId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invoice ID required' })
      };
    }
    
    // Get invoice with customer
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*, customers(*)')
      .eq('id', invoiceId)
      .single();
    
    if (invError || !invoice) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invoice not found' })
      };
    }
    
    // Check if invoice already synced
    if (invoice.qb_invoice_id) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ 
          success: true, 
          qb_invoice_id: invoice.qb_invoice_id,
          message: 'Invoice already synced to QuickBooks'
        })
      };
    }
    
    const customer = invoice.customers;
    if (!customer) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invoice has no associated customer' })
      };
    }
    
    // Ensure customer is synced to QB first
    let qbCustomerId = customer.qb_customer_id;
    if (!qbCustomerId) {
      // Sync customer first
      const custResult = await syncCustomer(customer);
      qbCustomerId = custResult.qb_customer_id;
      
      // Update customer in our DB
      await supabase
        .from('customers')
        .update({ qb_customer_id: qbCustomerId })
        .eq('id', customer.id);
    }
    
    // Get invoice line items
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('sort_order');
    
    // Build QB invoice
    const qbInvoice = {
      CustomerRef: { value: qbCustomerId },
      DocNumber: invoice.invoice_number,
      TxnDate: invoice.created_at ? invoice.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      DueDate: invoice.due_date ? invoice.due_date.split('T')[0] : undefined,
      Line: []
    };
    
    // Add line items
    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        qbInvoice.Line.push({
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
      // If no line items, create single line from invoice total
      qbInvoice.Line.push({
        DetailType: 'SalesItemLineDetail',
        Amount: invoice.subtotal || invoice.total || 0,
        Description: invoice.title || 'Services',
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: invoice.subtotal || invoice.total || 0
        }
      });
    }
    
    // Add tax if present
    if (invoice.tax && invoice.tax > 0) {
      // Note: For proper tax handling, you'd need to set up Tax Codes in QB
      // For simplicity, we'll add tax as a separate line item
      qbInvoice.Line.push({
        DetailType: 'SalesItemLineDetail',
        Amount: invoice.tax,
        Description: 'Sales Tax',
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: invoice.tax
        }
      });
    }
    
    // Create invoice in QuickBooks
    const result = await qbRequest('POST', '/invoice', qbInvoice);
    const qbInvoiceId = result.Invoice.Id;
    
    // Update our invoice with QB ID
    await supabase
      .from('invoices')
      .update({ 
        qb_invoice_id: qbInvoiceId,
        qb_synced_at: new Date().toISOString()
      })
      .eq('id', invoiceId);
    
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ 
        success: true, 
        qb_invoice_id: qbInvoiceId,
        message: 'Invoice created in QuickBooks'
      })
    };
    
  } catch (err) {
    console.error('QB sync invoice error:', err);
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
