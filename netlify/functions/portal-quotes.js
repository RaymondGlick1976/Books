// =============================================
// PORTAL QUOTES - Get all quotes for customer
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
    const { data: quotes } = await supabase
      .from('quotes')
      .select('*')
      .eq('customer_id', customer.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    
    return success({ quotes: quotes || [] });
    
  } catch (err) {
    console.error('Quotes fetch error:', err);
    return error('Failed to load quotes', 500);
  }
};
