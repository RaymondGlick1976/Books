// =============================================
// PORTAL QUOTE SELECTION - Save optional item and package selections
// =============================================

const { getSupabase, success, error, handleCors, validateSession, parseBody, advanceDealStage, notifyQuoteAccepted } = require('./utils');
const { buildInvoiceLines, invoiceHeaderFromQuote, insertInvoiceLines } = require('./invoice-builder');

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
  const { quote_id, item_id, selected, package_id, selected_options, selected_package_id, accept_quote, payment_method, attribute_change } = parseBody(event);
  
  if (!quote_id) {
    return error('Missing quote_id', 400);
  }
  
  try {
    // Verify quote belongs to customer
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, customer_id, tax_rate, status, title, total, subtotal, tax_amount, selected_package_id, payment_schedule, discount_type, discount_value')
      .eq('id', quote_id)
      .single();
    
    if (quoteError || !quote || quote.customer_id !== customer.id) {
      return error('Quote not found', 404);
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
            .eq('quote_id', quote_id);
        }
      }
      
      // Update selected package if provided
      if (selected_package_id) {
        await supabase
          .from('quote_packages')
          .update({ is_selected: false })
          .eq('quote_id', quote_id);
        
        await supabase
          .from('quote_packages')
          .update({ is_selected: true })
          .eq('id', selected_package_id)
          .eq('quote_id', quote_id);
      }
      
      // Mark quote as accepted
      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          selected_package_id: selected_package_id || null,
          payment_method: 'check'
        })
        .eq('id', quote_id);
      
      if (updateError) throw updateError;

      // Email the owner that the quote was accepted (non-blocking)
      await notifyQuoteAccepted(supabase, quote_id, { paymentMethod: 'check' });

      // Advance deal to "Quote Accepted" stage
      try {
        await advanceDealStage(supabase, { quoteId: quote_id, customerId: customer.id, targetStageId: 'job-sold' });
      } catch (stageErr) {
        console.error('Stage advance failed (non-blocking):', stageErr);
      }

      // Create invoice from quote
      try {
        // Guard: if an invoice already exists for this quote, don't create another
        const { data: existingInvoices } = await supabase
          .from('invoices')
          .select('id, invoice_number')
          .eq('quote_id', quote_id)
          .limit(1);
        if (existingInvoices && existingInvoices.length > 0) {
          console.log('Invoice already exists for quote, skipping creation:', existingInvoices[0].invoice_number);
          return success({
            accepted: true,
            message: 'Quote accepted. Payment instructions will be provided.',
            payment_method: 'check'
          });
        }

        // Build invoice lines: the selected bundle's items when the quote has bundles
        const { lineItems } = await buildInvoiceLines(supabase, quote, { selectedPackageId: selected_package_id });
        const taxRate = parseFloat(quote.tax_rate ?? 0);
        const invoiceSubtotal = lineItems.reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0);
        const taxableLines = lineItems.reduce((sum, l) => sum + (l.is_taxable ? (parseFloat(l.line_total) || 0) : 0), 0);
        const invoiceTaxAmount = taxableLines * taxRate;
        const invoiceTotal = invoiceSubtotal + invoiceTaxAmount;

        // Generate invoice number
        const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number');

        // Create invoice (carries the quote's payment schedule and discount)
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber || `INV-${Date.now()}`,
            quote_id: quote_id,
            customer_id: customer.id,
            title: quote.title,
            status: 'sent',
            subtotal: invoiceSubtotal,
            tax_rate: quote.tax_rate ?? 0,
            tax_amount: invoiceTaxAmount,
            total: invoiceTotal,
            amount_paid: 0,
            amount_due: invoiceTotal,
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            notes: 'Payment by check/cash',
            ...invoiceHeaderFromQuote(quote),
          })
          .select()
          .single();

        if (invoice) {
          await insertInvoiceLines(supabase, invoice.id, lineItems);
          console.log('Created invoice from acceptance:', invoice.invoice_number);
        } else if (invoiceError) {
          console.error('Invoice insert failed:', invoiceError);
        }
      } catch (invoiceErr) {
        console.error('Failed to create invoice from portal:', invoiceErr);
        // Don't fail the quote acceptance if invoice creation fails
      }

      return success({
        accepted: true,
        message: 'Quote accepted. Payment instructions will be provided.',
        payment_method: 'check'
      });
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
        .eq('quote_id', quote_id)
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
      } else if (sel.catalog_pricing_type === 'sqft' && sel.width && sel.height) {
        sel.line_total = sel.unit_price * ((sel.width * sel.height) / 144);
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
        .eq('quote_id', quote_id);

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
        .eq('id', quote_id);

      return success({ success: true, unit_price: newUnitPrice, line_total: newLineTotal, total: attrTotal, subtotal: attrSubtotal, tax_amount: attrTaxAmount });
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
        .eq('id', quote_id);
      
      return success({ success: true, total, subtotal, tax_amount: taxAmount });
    }
    
    return error('Missing item_id or package_id', 400);

  } catch (err) {
    console.error('Selection error:', err);
    return error('Server error', 500);
  }
};
