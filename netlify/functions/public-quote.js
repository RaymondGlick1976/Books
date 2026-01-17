// =============================================
// PUBLIC QUOTE - Get quote by access token (no login required)
// =============================================

const { getSupabase, success, error, handleCors } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  const token = event.queryStringParameters?.token;
  const isPreview = event.queryStringParameters?.preview === '1';
  
  if (!token) {
    return error('Access token required', 400);
  }
  
  console.log('Looking up quote with token:', token.substring(0, 8) + '...', isPreview ? '(admin preview)' : '');
  
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
    
    // Get change orders with their items
    const { data: changeOrders } = await supabase
      .from('change_orders')
      .select('*, change_order_items(*)')
      .eq('quote_id', quote.id)
      .order('created_at');
    
    // Get payments for this quote
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('quote_id', quote.id)
      .order('created_at', { ascending: false });
    
    // Get packages with items (with error handling in case table doesn't exist)
    let packages = [];
    try {
      const { data: pkgData, error: pkgError } = await supabase
        .from('quote_packages')
        .select('*, items:quote_package_items(*)')
        .eq('quote_id', quote.id)
        .order('sort_order');
      
      if (!pkgError && pkgData) {
        packages = pkgData;
      }
    } catch (e) {
      console.log('Packages table may not exist yet:', e.message);
    }
    
    // Update to viewed if sent (skip for admin preview)
    if (quote.status === 'sent' && !isPreview) {
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
    
    // Log this view (track all views, not just the first) - skip for admin preview
    if (!isPreview) {
      try {
        await supabase.from('quote_views').insert({
          quote_id: quote.id,
          source: 'public',
          ip_address: event.headers['x-forwarded-for']?.split(',')[0] || event.headers['client-ip'] || null,
          user_agent: event.headers['user-agent'] || null
        });
        
        // Increment view count
        await supabase.rpc('increment_quote_views', { quote_uuid: quote.id });
      } catch (viewErr) {
        // Don't fail the request if view logging fails
        console.log('View logging error (non-fatal):', viewErr.message);
      }
    }
    
    // Remove internal notes before sending
    delete quote.internal_notes;
    
    return success({
      quote,
      line_items: lineItems || [],
      attachments: attachments || [],
      change_orders: changeOrders || [],
      payments: payments || [],
      packages: packages || [],
    });
    
  } catch (err) {
    console.error('Public quote fetch error:', err);
    return error('Failed to load quote', 500);
  }
};
