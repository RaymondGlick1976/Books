// =============================================
// PORTAL QUOTE VIEW - Mark quote as viewed
// =============================================

const { getSupabase, success, error, handleCors, validateSession, parseBody } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const supabase = getSupabase();
  const { quote_id } = parseBody(event);
  
  if (!quote_id) {
    return error('Missing quote_id', 400);
  }
  
  try {
    // Verify quote belongs to customer and update status
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, customer_id, status')
      .eq('id', quote_id)
      .single();
    
    if (quoteError || !quote || quote.customer_id !== customer.id) {
      return error('Quote not found', 404);
    }
    
    // Only update if status is 'sent'
    if (quote.status === 'sent') {
      await supabase
        .from('quotes')
        .update({ 
          status: 'viewed',
          viewed_at: new Date().toISOString()
        })
        .eq('id', quote_id);
      
      // Log activity
      await supabase
        .from('activity_log')
        .insert({
          customer_id: customer.id,
          quote_id: quote_id,
          activity_type: 'quote_viewed',
          description: 'Customer viewed quote'
        });
    }
    
    return success({ success: true });
    
  } catch (err) {
    console.error('Quote view error:', err);
    return error('Server error', 500);
  }
};
