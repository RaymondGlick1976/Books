// =============================================
// PORTAL PAYMENTS - Get customer's payment history
// =============================================

const { getSupabase, success, error, handleCors, validateSession } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const supabase = getSupabase();
  
  try {
    // Get all payments for this customer
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select(`
        *,
        invoices(invoice_number, title),
        quotes(quote_number, title)
      `)
      .eq('customer_id', customer.id)
      .eq('status', 'succeeded')
      .order('created_at', { ascending: false });
    
    if (paymentsError) throw paymentsError;
    
    return success({ payments: payments || [] });
    
  } catch (err) {
    console.error('Payments fetch error:', err);
    return error('Failed to load payments', 500);
  }
};
