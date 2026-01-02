// =============================================
// PORTAL QUOTE SELECTION - Save optional item selections
// =============================================

const { getSupabase, success, error, handleCors, validateSession, parseBody } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  // Validate session
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const supabase = getSupabase();
  const { quote_id, item_id, selected } = parseBody(event);
  
  if (!quote_id || !item_id) {
    return error('Missing quote_id or item_id', 400);
  }
  
  try {
    // Verify quote belongs to customer
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, customer_id')
      .eq('id', quote_id)
      .single();
    
    if (quoteError || !quote || quote.customer_id !== customer.id) {
      return error('Quote not found', 404);
    }
    
    // Update line item selection
    const { error: updateError } = await supabase
      .from('quote_line_items')
      .update({ is_selected: selected })
      .eq('id', item_id)
      .eq('quote_id', quote_id);
    
    if (updateError) {
      console.error('Update error:', updateError);
      return error('Failed to update selection', 500);
    }
    
    return success({ success: true });
    
  } catch (err) {
    console.error('Selection error:', err);
    return error('Server error', 500);
  }
};
