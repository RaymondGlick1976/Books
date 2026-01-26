// =============================================
// QUICKBOOKS SYNC CUSTOMER - Create/update customer in QB
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
    const { customerId } = JSON.parse(event.body);
    
    if (!customerId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Customer ID required' })
      };
    }
    
    // Get customer from our database
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single();
    
    if (custError || !customer) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }
    
    // Check if customer already exists in QuickBooks
    if (customer.qb_customer_id) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ 
          success: true, 
          qb_customer_id: customer.qb_customer_id,
          message: 'Customer already synced to QuickBooks'
        })
      };
    }
    
    // First, check if a customer with this email already exists in QB
    let existingQBCustomer = null;
    if (customer.email) {
      try {
        const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${customer.email.replace(/'/g, "\\'")}'`;
        const searchResult = await qbRequest('GET', `/query?query=${encodeURIComponent(query)}`);
        if (searchResult.QueryResponse?.Customer?.length > 0) {
          existingQBCustomer = searchResult.QueryResponse.Customer[0];
        }
      } catch (e) {
        console.log('Customer search failed, will create new:', e.message);
      }
    }
    
    let qbCustomerId;
    
    if (existingQBCustomer) {
      // Use existing QB customer
      qbCustomerId = existingQBCustomer.Id;
    } else {
      // Parse name into first/last
      const nameParts = (customer.name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Create customer in QuickBooks
      const qbCustomer = {
        DisplayName: customer.name || customer.email || 'Unknown Customer',
        GivenName: firstName || undefined,
        FamilyName: lastName || undefined,
        PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
        PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
        BillAddr: customer.address ? { Line1: customer.address } : undefined
      };
      
      // Remove undefined fields
      Object.keys(qbCustomer).forEach(key => {
        if (qbCustomer[key] === undefined) delete qbCustomer[key];
      });
      
      const result = await qbRequest('POST', '/customer', qbCustomer);
      qbCustomerId = result.Customer.Id;
    }
    
    // Update our customer with QB ID
    await supabase
      .from('customers')
      .update({ qb_customer_id: qbCustomerId })
      .eq('id', customerId);
    
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ 
        success: true, 
        qb_customer_id: qbCustomerId,
        message: existingQBCustomer ? 'Linked to existing QuickBooks customer' : 'Customer created in QuickBooks'
      })
    };
    
  } catch (err) {
    console.error('QB sync customer error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: err.message })
    };
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
