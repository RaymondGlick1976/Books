// =============================================
// PORTAL INVOICES - Get all invoices and payments
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
    // Get invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', customer.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    
    // Get payments with invoice info
    const { data: payments } = await supabase
      .from('payments')
      .select(`
        *,
        invoices(invoice_number, title)
      `)
      .eq('customer_id', customer.id)
      .eq('status', 'succeeded')
      .order('payment_date', { ascending: false });
    
    return success({
      invoices: invoices || [],
      payments: payments || [],
    });
    
  } catch (err) {
    console.error('Invoices fetch error:', err);
    return error('Failed to load invoices', 500);
  }
};
