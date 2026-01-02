// =============================================
// PORTAL DATA - Get all customer data for dashboard
// =============================================

const { getSupabase, success, error, handleCors, validateSession } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  // Validate session
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const supabase = getSupabase();
  
  try {
    // Get all quotes
    const { data: quotes } = await supabase
      .from('quotes')
      .select('*')
      .eq('customer_id', customer.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    
    // Get all invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', customer.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    
    // Get all payments
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('customer_id', customer.id)
      .order('payment_date', { ascending: false });
    
    return success({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
      },
      quotes: quotes || [],
      invoices: invoices || [],
      payments: payments || [],
    });
    
  } catch (err) {
    console.error('Portal data error:', err);
    return error('Failed to load data', 500);
  }
};
