// =============================================
// QUICKBOOKS SYNC PAYMENT - Record payment in QB
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
    const { paymentId } = JSON.parse(event.body);
    
    if (!paymentId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Payment ID required' })
      };
    }
    
    // Get payment with invoice and customer
    const { data: payment, error: payError } = await supabase
      .from('payments')
      .select('*, invoices(*, customers(*))')
      .eq('id', paymentId)
      .single();
    
    if (payError || !payment) {
      return {
        statusCode: 404,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Payment not found' })
      };
    }
    
    // Check if payment already synced
    if (payment.qb_payment_id) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ 
          success: true, 
          qb_payment_id: payment.qb_payment_id,
          message: 'Payment already synced to QuickBooks'
        })
      };
    }
    
    const invoice = payment.invoices;
    const customer = invoice?.customers;
    
    if (!invoice) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Payment has no associated invoice' })
      };
    }
    
    // Invoice must be synced first
    if (!invoice.qb_invoice_id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invoice must be synced to QuickBooks first' })
      };
    }
    
    // Customer must be synced
    if (!customer?.qb_customer_id) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Customer must be synced to QuickBooks first' })
      };
    }
    
    // Build QB payment
    const qbPayment = {
      CustomerRef: { value: customer.qb_customer_id },
      TotalAmt: payment.amount,
      TxnDate: payment.created_at ? payment.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      Line: [{
        Amount: payment.amount,
        LinkedTxn: [{
          TxnId: invoice.qb_invoice_id,
          TxnType: 'Invoice'
        }]
      }],
      PrivateNote: `Stripe: ${payment.stripe_payment_id || 'N/A'}`
    };
    
    // Create payment in QuickBooks
    const result = await qbRequest('POST', '/payment', qbPayment);
    const qbPaymentId = result.Payment.Id;
    
    // Update our payment with QB ID
    await supabase
      .from('payments')
      .update({ 
        qb_payment_id: qbPaymentId,
        qb_synced_at: new Date().toISOString()
      })
      .eq('id', paymentId);
    
    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ 
        success: true, 
        qb_payment_id: qbPaymentId,
        message: 'Payment recorded in QuickBooks'
      })
    };
    
  } catch (err) {
    console.error('QB sync payment error:', err);
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
