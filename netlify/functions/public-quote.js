// =============================================
// PUBLIC QUOTE - Get quote by access token (no login required)
// =============================================

const { getSupabase, success, error, handleCors } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  const token = event.queryStringParameters?.token;
  if (!token) {
    return error('Access token required', 400);
  }
  
  console.log('Looking up quote with token:', token.substring(0, 8) + '...');
  
  const supabase = getSupabase();
  
  try {
    // Get quote by access token
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*, customers(name, email, phone)')
      .eq('access_token', token)
      .single();
    
    if (quoteError) {
      console.error('Quote lookup error:', quoteError);
      return error('Quote not found or link expired', 404);
    }
    
    if (!quote) {
      console.error('No quote found for token');
      return error('Quote not found or link expired', 404);
    }
    
    console.log('Found quote:', quote.quote_number);
    
    // Check if quote is expired
    if (quote.expires_at && new Date(quote.expires_at) < new Date()) {
      return error('This quote has expired', 410);
    }
    
    // Get line items
    const { data: lineItems } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quote.id)
      .order('sort_order');
    
    // Get attachments
    const { data: attachments } = await supabase
      .from('quote_attachments')
      .select('*')
      .eq('quote_id', quote.id)
      .order('display_order');
    
    // Update to viewed if sent
    if (quote.status === 'sent') {
      await supabase
        .from('quotes')
        .update({
          status: 'viewed',
          viewed_at: new Date().toISOString()
        })
        .eq('id', quote.id);
      
      quote.status = 'viewed';
      quote.viewed_at = new Date().toISOString();
    }
    
    // Remove internal notes before sending
    delete quote.internal_notes;
    
    return success({
      quote,
      line_items: lineItems || [],
      attachments: attachments || [],
    });
    
  } catch (err) {
    console.error('Public quote fetch error:', err);
    return error('Failed to load quote', 500);
  }
};
