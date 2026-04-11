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
        let subtotal = 0;
        
        // Use package price if set, otherwise calculate from items
        if (selectedPkg.price !== null && selectedPkg.price !== undefined && selectedPkg.price !== '') {
          subtotal = parseFloat(selectedPkg.price) || 0;
        } else if (selectedPkg.quote_package_items && selectedPkg.quote_package_items.length > 0) {
          // Calculate from package items
          subtotal = selectedPkg.quote_package_items
            .filter(item => item.is_included !== false)
            .reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (item.quantity || 1)), 0);
        }
        quote.display_total = subtotal;
      } else {
        // Use subtotal for consistency (total includes tax)
        quote.display_total = quote.subtotal || quote.total || 0;
      }
      return quote;
    });
    
    // Get all invoices (exclude draft and archived)
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', customer.id)
      .not('status', 'in', '(draft,archived)')
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
      quotes: quotesWithTotals,
      invoices: invoices || [],
      payments: payments || [],
    });
    
  } catch (err) {
    console.error('Portal data error:', err);
    return error('Failed to load data', 500);
  }
};
