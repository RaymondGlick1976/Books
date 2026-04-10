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
  
  const { token, item_id, is_selected, package_id, selected_options, selected_package_id, accept_quote, payment_method, attribute_change } = parseBody(event);
  
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
      console.error('Quote lookup error:', quoteError);
      return error('Invalid access token', 401);
    }
    
    console.log('Quote found:', quote.id, 'Status:', quote.status, 'Accept:', accept_quote, 'Payment:', payment_method);
    
    // Handle accept quote with check/cash payment
    if (accept_quote && payment_method === 'check') {
      // Only allow accepting quotes that are sent or viewed (or draft for testing)
      if (!['sent', 'viewed', 'draft'].includes(quote.status)) {
        console.error('Invalid status for acceptance:', quote.status);
        return error(`Quote cannot be accepted (status: ${quote.status})`, 400);
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
      
      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }
      
      // Create invoice from quote
      try {
        // Calculate total from packages or line items
        let invoiceTotal = quote.total || 0;
        let invoiceSubtotal = quote.subtotal || 0;
        let invoiceTaxAmount = quote.tax_amount || 0;
        
        // Check for packages
        const { data: packages } = await supabase
          .from('quote_packages')
          .select('*, quote_package_items(*)')
          .eq('quote_id', quote.id);
        
        if (packages && packages.length > 0) {
          const selectedPkg = selected_package_id 
            ? packages.find(p => p.id === selected_package_id)
            : packages.find(p => p.is_selected) || packages[0];
          
          if (selectedPkg) {
            invoiceSubtotal = parseFloat(selectedPkg.price) || 0;
            const taxRate = parseFloat(quote.tax_rate ?? 0);
            invoiceTaxAmount = invoiceSubtotal * taxRate;
            invoiceTotal = invoiceSubtotal + invoiceTaxAmount;
          }
        }
        
        // Generate invoice number
        const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number');
        
        // Create invoice
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber || `INV-${Date.now()}`,
            quote_id: quote.id,
            customer_id: quote.customer_id,
            title: quote.title,
            status: 'sent', // Sent status since they haven't paid yet
            subtotal: invoiceSubtotal,
            tax_rate: quote.tax_rate ?? 0,
            tax_amount: invoiceTaxAmount,
            total: invoiceTotal,
            amount_paid: 0,
            amount_due: invoiceTotal,
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            notes: 'Payment by check/cash',
          })
          .select()
          .single();
        
        if (invoice) {
          // Copy line items to invoice (if using line items, not packages)
          if (!packages || packages.length === 0) {
            const { data: quoteItems } = await supabase
              .from('quote_line_items')
              .select('*')
              .eq('quote_id', quote.id)
              .or('is_optional.eq.false,is_selected.eq.true');
            
            if (quoteItems && quoteItems.length > 0) {
              const invoiceItems = quoteItems.map(item => ({
                invoice_id: invoice.id,
                description: item.description,
                details: item.details,
                quantity: item.quantity,
                unit: item.unit,
                unit_price: item.unit_price,
                line_total: item.line_total,
                is_taxable: item.is_taxable,
                sort_order: item.sort_order,
                attribute_selections: item.attribute_selections || [],
              }));

              await supabase.from('invoice_line_items').insert(invoiceItems);
            }
          } else {
            // For package-based quotes, create a single line item for the package
            const selectedPkg = packages.find(p => p.is_selected) || packages[0];
            if (selectedPkg) {
              await supabase.from('invoice_line_items').insert({
                invoice_id: invoice.id,
                description: selectedPkg.name || quote.title,
                details: selectedPkg.description || '',
                quantity: 1,
                unit: 'each',
                unit_price: parseFloat(selectedPkg.price) || invoiceSubtotal,
                line_total: parseFloat(selectedPkg.price) || invoiceSubtotal,
                is_taxable: true,
                sort_order: 0,
              });
            }
          }
          
          console.log('Created invoice:', invoice.invoice_number);
        }
      } catch (invoiceErr) {
        console.error('Failed to create invoice:', invoiceErr);
        // Don't fail the quote acceptance if invoice creation fails
      }
      
      return success({ 
        accepted: true, 
        message: 'Quote accepted. Payment instructions will be provided.',
        payment_method: 'check'
      });
    }
    
    // Only allow selection on sent/viewed/draft quotes
    if (!['sent', 'viewed', 'draft'].includes(quote.status)) {
      return error(`Quote cannot be modified (status: ${quote.status})`, 400);
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
    
    // Handle attribute selection change (must be checked before item_id)
    if (item_id && attribute_change) {
      const { attribute_id, new_option_id } = attribute_change;

      if (!attribute_id || !new_option_id) {
        return error('attribute_id and new_option_id required', 400);
      }

      // Get the line item
      const { data: lineItem, error: itemError } = await supabase
        .from('quote_line_items')
        .select('id, unit_price, quantity, attribute_selections, base_price, is_taxable')
        .eq('id', item_id)
        .eq('quote_id', quote.id)
        .single();

      if (itemError || !lineItem) {
        return error('Line item not found', 404);
      }

      const attrSelections = lineItem.attribute_selections || [];
      const selIndex = attrSelections.findIndex(s => s.attribute_id === attribute_id && s.is_public);

      if (selIndex === -1) {
        return error('Public attribute not found on this item', 404);
      }

      const sel = attrSelections[selIndex];
      const newOption = (sel.available_options || []).find(o => o.option_id === new_option_id);
      if (!newOption) {
        return error('Invalid option', 400);
      }

      // Calculate base price
      let basePrice = lineItem.base_price;
      if (basePrice === null || basePrice === undefined) {
        const totalAttrValue = attrSelections.reduce((sum, s) => sum + (parseFloat(s.line_total) || 0), 0);
        basePrice = (parseFloat(lineItem.unit_price) || 0) - totalAttrValue;
      }

      // Only update price when option actually changes; preserve admin override otherwise
      const optionChanged = sel.option_id !== new_option_id;
      sel.option_id = newOption.option_id;
      sel.option_name = newOption.option_name;
      if (optionChanged) {
        sel.unit_price = newOption.unit_price;
      }
      sel.pricing_type = newOption.pricing_type;

      // Recalculate line_total for this attribute
      if (sel.pricing_type === 'percentage') {
        sel.line_total = basePrice * (sel.unit_price / 100);
      } else {
        sel.line_total = sel.unit_price * (sel.quantity || 1);
      }

      // Recalculate item price
      const newAttrTotal = attrSelections.reduce((sum, s) => sum + (parseFloat(s.line_total) || 0), 0);
      const newUnitPrice = Math.round((basePrice + newAttrTotal) * 100) / 100;
      const newLineTotal = Math.round(newUnitPrice * (lineItem.quantity || 1) * 100) / 100;

      // Update the line item
      const { error: attrUpdateError } = await supabase
        .from('quote_line_items')
        .update({
          attribute_selections: attrSelections,
          unit_price: newUnitPrice,
          line_total: newLineTotal,
          line_total_low: newLineTotal,
          line_total_high: newLineTotal
        })
        .eq('id', item_id);

      if (attrUpdateError) throw attrUpdateError;

      // Recalculate quote totals
      const { data: allItems } = await supabase
        .from('quote_line_items')
        .select('*')
        .eq('quote_id', quote.id);

      let attrSubtotal = 0;
      let attrTaxableSubtotal = 0;

      (allItems || []).forEach(it => {
        const includeInTotal = !it.is_optional || it.is_selected;
        if (includeInTotal) {
          const lt = it.id === item_id ? newLineTotal : ((parseFloat(it.unit_price) || 0) * (it.quantity || 1));
          attrSubtotal += lt;
          if (it.is_taxable) attrTaxableSubtotal += lt;
        }
      });

      const attrTaxRate = parseFloat(quote.tax_rate ?? 0);
      const attrTaxAmount = attrTaxableSubtotal * attrTaxRate;
      const attrTotal = attrSubtotal + attrTaxAmount;

      await supabase
        .from('quotes')
        .update({ subtotal: attrSubtotal, tax_amount: attrTaxAmount, total: attrTotal })
        .eq('id', quote.id);

      return success({ updated: true, unit_price: newUnitPrice, line_total: newLineTotal, total: attrTotal, subtotal: attrSubtotal, tax_amount: attrTaxAmount });
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
      
      const taxRate = parseFloat(quote.tax_rate ?? 0);
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
    return error(err.message || 'Failed to update selection', 500);
  }
};
