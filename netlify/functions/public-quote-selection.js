// =============================================
// PUBLIC QUOTE SELECTION - Save optional item selections (no login required)
// =============================================

const { getSupabase, success, error, handleCors, parseBody } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const { token, item_id, is_selected } = parseBody(event);
  
  if (!token || !item_id) {
    return error('Token and item ID required', 400);
  }
  
  const supabase = getSupabase();
  
  try {
    // Verify token and get quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, status')
      .eq('access_token', token)
      .single();
    
    if (quoteError || !quote) {
      return error('Invalid access token', 401);
    }
    
    // Only allow selection on sent/viewed quotes
    if (!['sent', 'viewed'].includes(quote.status)) {
      return error('Quote cannot be modified', 400);
    }
    
    // Verify line item belongs to this quote and is optional
    const { data: lineItem, error: itemError } = await supabase
      .from('quote_line_items')
      .select('id, is_optional')
      .eq('id', item_id)
      .eq('quote_id', quote.id)
      .single();
    
    if (itemError || !lineItem) {
      return error('Line item not found', 404);
    }
    
    if (!lineItem.is_optional) {
      return error('Only optional items can be toggled', 400);
    }
    
    // Update selection
    const { error: updateError } = await supabase
      .from('quote_line_items')
      .update({ is_selected: is_selected })
      .eq('id', item_id);
    
    if (updateError) throw updateError;
    
    return success({ updated: true });
    
  } catch (err) {
    console.error('Selection update error:', err);
    return error('Failed to update selection', 500);
  }
};
