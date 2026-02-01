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
    
    // Get packages for these quotes to calculate display totals
    let packagesMap = {};
    if (quotes && quotes.length > 0) {
      const quoteIds = quotes.map(q => q.id);
      const { data: packages } = await supabase
        .from('quote_packages')
        .select('quote_id, id, name, price, is_selected, quote_package_items(price, quantity, is_included)')
        .in('quote_id', quoteIds);
      
      if (packages) {
        packages.forEach(pkg => {
          if (!packagesMap[pkg.quote_id]) {
            packagesMap[pkg.quote_id] = [];
          }
          packagesMap[pkg.quote_id].push(pkg);
        });
      }
    }
    
    // Calculate display_total for each quote
    const quotesWithTotals = (quotes || []).map(quote => {
      const pkgs = packagesMap[quote.id] || [];
      if (pkgs.length > 0) {
        const selectedPkg = pkgs.find(p => p.is_selected) || pkgs[0];
        
        // Use package price if set, otherwise calculate from items
        if (selectedPkg.price !== null && selectedPkg.price !== undefined && selectedPkg.price !== '') {
          quote.display_total = parseFloat(selectedPkg.price) || 0;
        } else if (selectedPkg.quote_package_items && selectedPkg.quote_package_items.length > 0) {
          // Calculate from package items
          quote.display_total = selectedPkg.quote_package_items
            .filter(item => item.is_included !== false)
            .reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (item.quantity || 1)), 0);
        } else {
          quote.display_total = 0;
        }
      } else {
        quote.display_total = quote.total || 0;
      }
      return quote;
    });
    
    return success({ quotes: quotesWithTotals });
    
  } catch (err) {
    console.error('Quotes fetch error:', err);
    return error('Failed to load quotes', 500);
  }
};
