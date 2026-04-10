const { getSupabase, success, error } = require('./utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return success({});

  const supabase = getSupabase();
  const invoice_number = 'INV-2026-1003';

  // Get the invoice
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', invoice_number)
    .single();

  if (invErr || !invoice) return error('Invoice not found');

  // Get the linked quote
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', invoice.quote_id)
    .single();

  if (qErr || !quote) return error('Quote not found');

  const taxRate = parseFloat(quote.tax_rate ?? 0);

  // Recalculate from quote line items
  const { data: lineItems } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quote.id);

  let subtotal = 0;
  let taxableSubtotal = 0;

  (lineItems || []).forEach(item => {
    const includeInTotal = !item.is_optional || item.is_selected;
    if (includeInTotal) {
      const lineTotal = (parseFloat(item.unit_price) || 0) * (item.quantity || 1);
      subtotal += lineTotal;
      if (item.is_taxable) taxableSubtotal += lineTotal;
    }
  });

  const taxAmount = taxableSubtotal * taxRate;
  const total = subtotal + taxAmount;
  const amountDue = total - parseFloat(invoice.amount_paid || 0);

  // Update the invoice
  const { error: updateErr } = await supabase
    .from('invoices')
    .update({
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      amount_due: Math.max(0, amountDue),
    })
    .eq('id', invoice.id);

  if (updateErr) return error('Update failed: ' + updateErr.message);

  return success({
    message: 'Invoice fixed',
    before: { subtotal: invoice.subtotal, tax_rate: invoice.tax_rate, tax_amount: invoice.tax_amount, total: invoice.total, amount_due: invoice.amount_due },
    after: { subtotal, tax_rate: taxRate, tax_amount: taxAmount, total, amount_due: Math.max(0, amountDue) },
  });
};
