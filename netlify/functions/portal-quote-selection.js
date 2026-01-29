// =============================================
// PORTAL QUOTE SELECTION - Save optional item and package selections
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
  const { quote_id, item_id, selected, package_id } = parseBody(event);
  
  if (!quote_id) {
    return error('Missing quote_id', 400);
  }
  
  try {
    // Verify quote belongs to customer
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, customer_id, tax_rate')
      .eq('id', quote_id)
      .single();
    
    if (quoteError || !quote || quote.customer_id !== customer.id) {
      return error('Quote not found', 404);
    }
    
    // Handle package selection
    if (package_id !== undefined) {
      // First, deselect all packages for this quote
      await supabase
        .from('quote_packages')
        .update({ is_selected: false })
        .eq('quote_id', quote_id);
      
      // Then select the chosen package (if not null)
      if (package_id) {
        await supabase
          .from('quote_packages')
          .update({ is_selected: true })
          .eq('id', package_id)
          .eq('quote_id', quote_id);
      }
      
      // Update quote's selected_package_id
      await supabase
        .from('quotes')
        .update({ selected_package_id: package_id || null })
        .eq('id', quote_id);
      
      return success({ success: true, package_id });
    }
    
    // Handle item selection
    if (item_id) {
      const { error: updateError } = await supabase
        .from('quote_line_items')
        .update({ is_selected: selected })
        .eq('id', item_id)
        .eq('quote_id', quote_id);
      
      if (updateError) {
        console.error('Update error:', updateError);
        return error('Failed to update selection', 500);
      }
      
      // Recalculate quote totals based on current selections
      const { data: lineItems } = await supabase
        .from('quote_line_items')
        .select('*')
        .eq('quote_id', quote_id);
      
      let subtotal = 0;
      let taxableSubtotal = 0;
      
      (lineItems || []).forEach(item => {
        // Include item if: not optional, OR optional and selected
        const includeInTotal = !item.is_optional || item.is_selected;
        if (includeInTotal) {
          const lineTotal = (item.unit_price || 0) * (item.quantity || 1);
          subtotal += lineTotal;
          if (item.is_taxable) {
            taxableSubtotal += lineTotal;
          }
        }
      });
      
      const taxRate = quote.tax_rate || 0.0625;
      const taxAmount = taxableSubtotal * taxRate;
      const total = subtotal + taxAmount;
      
      // Update quote with new totals
      await supabase
        .from('quotes')
        .update({
          subtotal: subtotal,
          tax_amount: taxAmount,
          total: total
        })
        .eq('id', quote_id);
      
      return success({ success: true, total, subtotal, tax_amount: taxAmount });
    }
    
    return error('Missing item_id or package_id', 400);
    
  } catch (err) {
    console.error('Selection error:', err);
    return error('Server error', 500);
  }
};
