// =============================================
// PORTAL UPLOADS - Get customer uploads
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
    const { data: uploads } = await supabase
      .from('customer_uploads')
      .select('*')
      .eq('customer_id', customer.id)
      .order('uploaded_at', { ascending: false });
    
    return success({ uploads: uploads || [] });
    
  } catch (err) {
    console.error('Uploads fetch error:', err);
    return error('Failed to load uploads', 500);
  }
};
