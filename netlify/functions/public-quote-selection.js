// =============================================
// PUBLIC QUOTE SELECTION - Save optional item and package selections (no login required)
// =============================================

const { getSupabase, success, error, handleCors, parseBody } = require('./utils');

exports.handler = async (event) => {
  const corsResponse = handleCors(event);
  if (corsResponse) return corsResponse;
  
  if (event.httpMethod !== 'POST') {
    return error('Method not allowed', 405);
  }
  
  const { token, item_id, is_selected, package_id, selected_options, selected_package_id, accept_quote, payment_method } = parseBody(event);
  
  if (!token) {
    return error('Token required', 400);
  }
  
  const supabase = getSupabase();
  
  try {
    // Verify token and get quote
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, status, tax_rate, customer_id')
      .eq('access_token', token)
      .single();
    
    if (quoteError || !quote) {
      return error('Invalid access token', 401);
    }
    
    // Handle accept quote with check/cash payment
    if (accept_quote && payment_method === 'check') {
      // Only allow accepting quotes that are sent or viewed
      if (!['sent', 'viewed', 'draft'].includes(quote.status)) {
        return error('Quote cannot be accepted', 400);
      }
      
      // Update selected options if provided
      if (selected_options && selected_options.length > 0) {
        for (const optionId of selected_options) {
          await supabase
            .from('quote_line_items')
            .update({ is_selected: true })
            .eq('id', optionId)
            .eq('quote_id', quote.id);
        }
      }
      
      // Update selected package if provided
      if (selected_package_id) {
        await supabase
          .from('quote_packages')
          .update({ is_selected: false })
          .eq('quote_id', quote.id);
        
        await supabase
          .from('quote_packages')
          .update({ is_selected: true })
          .eq('id', selected_package_id)
          .eq('quote_id', quote.id);
      }
      
      // Mark quote as accepted
      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          selected_package_id: selected_package_id || null,
          payment_method: 'check' // Store that this is a check payment
        })
        .eq('id', quote.id);
      
      if (updateError) throw updateError;
      
      return success({ 
        accepted: true, 
        message: 'Quote accepted. Payment instructions will be provided.',
        payment_method: 'check'
      });
    }
    
    // Only allow selection on sent/viewed quotes
    if (!['sent', 'viewed'].includes(quote.status)) {
      return error('Quote cannot be modified', 400);
    }
    
    // Handle package selection
    if (package_id !== undefined) {
      // First, deselect all packages for this quote
      await supabase
        .from('quote_packages')
        .update({ is_selected: false })
        .eq('quote_id', quote.id);
      
      // Then select the chosen package (if not null)
      if (package_id) {
        await supabase
          .from('quote_packages')
          .update({ is_selected: true })
          .eq('id', package_id)
          .eq('quote_id', quote.id);
      }
      
      // Update quote's selected_package_id
      await supabase
        .from('quotes')
        .update({ selected_package_id: package_id || null })
        .eq('id', quote.id);
      
      return success({ updated: true, package_id });
    }
    
    // Handle item selection
    if (item_id) {
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
      
      // Recalculate quote totals based on current selections
      const { data: lineItems } = await supabase
        .from('quote_line_items')
        .select('*')
        .eq('quote_id', quote.id);
      
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
        .eq('id', quote.id);
      
      return success({ updated: true, total, subtotal, tax_amount: taxAmount });
    }
    
    return error('Missing item_id or package_id', 400);
    
  } catch (err) {
    console.error('Selection update error:', err);
    return error('Failed to update selection', 500);
  }
};
