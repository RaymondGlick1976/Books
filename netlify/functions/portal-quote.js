// =============================================
// PORTAL QUOTE - Get single quote with line items
// =============================================

const { getSupabase, success, error, handleCors, validateSession } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  const customer = await validateSession(event);
  if (!customer) {
    return error('Unauthorized', 401);
  }
  
  const quoteId = event.queryStringParameters?.id;
  if (!quoteId) {
    return error('Quote ID required');
  }
  
  const supabase = getSupabase();
  
  try {
    // Get quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', quoteId)
      .eq('customer_id', customer.id)
      .single();
    
    if (quoteError || !quote) {
      return error('Quote not found', 404);
    }
    
    // Get line items
    const { data: lineItems } = await supabase
      .from('quote_line_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order');
    
    // Get attachments
    const { data: attachments } = await supabase
      .from('quote_attachments')
      .select('*')
      .eq('quote_id', quoteId)
      .order('display_order');
    
    // Get change orders with their items
    const { data: changeOrders } = await supabase
      .from('change_orders')
      .select('*, change_order_items(*)')
      .eq('quote_id', quoteId)
      .order('created_at');
    
    // Get payments for this quote
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false });
    
    return success({
      quote,
      line_items: lineItems || [],
      attachments: attachments || [],
      change_orders: changeOrders || [],
      payments: payments || [],
    });
    
  } catch (err) {
    console.error('Quote fetch error:', err);
    return error('Failed to load quote', 500);
  }
};
