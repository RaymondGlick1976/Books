// =============================================
// INVOICE BUILDER - Shared quote -> invoice conversion helpers
// Used by stripe-webhook, portal-quote-selection and public-quote-selection.
// Builds invoice lines from the SELECTED bundle (package) when a quote has
// bundles, otherwise from the quote's line items, and carries over the
// quote's payment schedule and discount.
// =============================================

function pickSelectedPackage(packages, quote, selectedPackageId) {
  if (!packages || packages.length === 0) return null;
  return (selectedPackageId && packages.find(p => p.id === selectedPackageId))
    || (quote.selected_package_id && packages.find(p => p.id === quote.selected_package_id))
    || packages.find(p => p.is_selected)
    || packages[0];
}

function buildDetails(description, attributeSelections) {
  const attrs = (attributeSelections || [])
    .filter(sel => sel && sel.option_name)
    .map(sel => `${sel.attribute_name}: ${sel.option_name}`)
    .join('\n');
  return [description || '', attrs].filter(Boolean).join('\n');
}

const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// Returns { lineItems, selectedPackageId, bundleName } — lineItems have no invoice_id yet.
async function buildInvoiceLines(supabase, quote, { selectedPackageId } = {}) {
  const { data: packages } = await supabase
    .from('quote_packages')
    .select('*, quote_package_items(*)')
    .eq('quote_id', quote.id)
    .order('sort_order', { ascending: true });

  const lineItems = [];

  if (packages && packages.length > 0) {
    const pkg = pickSelectedPackage(packages, quote, selectedPackageId);
    const taxable = pkg.apply_tax === true;
    const pkgItems = (pkg.quote_package_items || [])
      .filter(i => i.is_included !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    let itemsTotal = 0;
    pkgItems.forEach((item, idx) => {
      const qty = parseFloat(item.quantity) || 1;
      const unit = parseFloat(item.price) || 0;
      const lineTotal = round2(unit * qty);
      itemsTotal += lineTotal;
      lineItems.push({
        description: item.name,
        details: buildDetails(item.description, item.attribute_selections),
        quantity: qty,
        unit_price: unit,
        line_total: lineTotal,
        is_taxable: taxable,
        apply_discount: true,
        sort_order: idx,
      });
    });

    // Bundle with an override price: keep the invoice total equal to the bundle price
    if (pkg.price !== null && pkg.price !== undefined && pkg.price !== '') {
      const override = round2(pkg.price);
      const diff = round2(override - itemsTotal);
      if (pkgItems.length === 0) {
        lineItems.push({
          description: pkg.name || quote.title,
          details: pkg.description || '',
          quantity: 1,
          unit_price: override,
          line_total: override,
          is_taxable: taxable,
          apply_discount: true,
          sort_order: 0,
        });
      } else if (diff !== 0) {
        lineItems.push({
          description: `${pkg.name || 'Bundle'} - bundle price adjustment`,
          details: '',
          quantity: 1,
          unit_price: diff,
          line_total: diff,
          is_taxable: taxable,
          apply_discount: true,
          sort_order: pkgItems.length,
        });
      }
    }

    return { lineItems, selectedPackageId: pkg.id, bundleName: pkg.name || null };
  }

  // No bundles: copy accepted line items
  const { data: quoteItems } = await supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', quote.id)
    .or('is_optional.eq.false,is_selected.eq.true')
    .order('sort_order', { ascending: true });

  (quoteItems || []).forEach((item, idx) => {
    lineItems.push({
      description: item.description,
      details: buildDetails(item.details, item.attribute_selections),
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      line_total: item.line_total,
      is_taxable: item.is_taxable,
      apply_discount: item.apply_discount !== false,
      attribute_selections: item.attribute_selections || [],
      sort_order: idx,
    });
  });

  return { lineItems, selectedPackageId: null, bundleName: null };
}

// Header fields every invoice created from a quote should carry
function invoiceHeaderFromQuote(quote) {
  const header = {
    payment_schedule: Array.isArray(quote.payment_schedule) && quote.payment_schedule.length > 0
      ? quote.payment_schedule
      : null,
  };
  if (quote.discount_type && quote.discount_value) {
    header.discount_type = quote.discount_type;
    header.discount_value = quote.discount_value;
  }
  return header;
}

// Payment schedule to show on an invoice. Uses the schedule copied onto the invoice;
// when that is missing, falls back to the agreed schedule on the linked quote.
async function resolveInvoicePaymentSchedule(supabase, invoice) {
  if (Array.isArray(invoice.payment_schedule) && invoice.payment_schedule.length > 0) {
    return invoice.payment_schedule;
  }
  if (!invoice.quote_id) return null;
  const { data: quote } = await supabase
    .from('quotes')
    .select('payment_schedule')
    .eq('id', invoice.quote_id)
    .single();
  return Array.isArray(quote?.payment_schedule) && quote.payment_schedule.length > 0
    ? quote.payment_schedule
    : null;
}

// Each milestone of the payment schedule with its amount and status (paid / partial / due).
// Fixed payments (e.g. a deposit) come off the total first; percentages apply to the rest.
// Money received (invoice.amount_paid) is applied to milestones in schedule order.
function buildPaymentScheduleRows(invoice) {
  const sched = Array.isArray(invoice.payment_schedule) ? invoice.payment_schedule : [];
  if (sched.length === 0) return [];
  const total = parseFloat(invoice.total) || 0;
  const fixedTotal = sched.filter(p => p.amount_type === 'fixed').reduce((s, p) => s + (parseFloat(p.amount_value) || 0), 0);
  const base = Math.max(0, total - fixedTotal);
  let unapplied = Math.max(0, parseFloat(invoice.amount_paid) || 0);
  return sched.map(p => {
    const v = parseFloat(p.amount_value) || 0;
    const amount = p.amount_type === 'percentage' ? base * (v / 100) : v;
    const applied = Math.min(amount, unapplied);
    unapplied -= applied;
    const status = applied >= amount - 0.005 ? 'paid' : applied > 0.005 ? 'partial' : 'due';
    return { name: p.name || '', due_description: p.due_description || '', amount, remaining: amount - applied, status };
  });
}

// The payment due now: the first milestone not yet fully paid, with the amount still owed on it.
// Falls back to null (use the full balance) when there is no schedule or nothing is left on it.
function nextPaymentDue(invoice) {
  const next = buildPaymentScheduleRows(invoice).find(r => r.status !== 'paid');
  return next ? { name: next.name, amount: next.remaining } : null;
}

// Payment schedule block for the invoice email (empty string when there is no schedule)
function paymentScheduleEmailHtml(invoice, formatCurrency) {
  const rows = buildPaymentScheduleRows(invoice);
  if (rows.length === 0) return '';
  const labels = { paid: ['Paid', '#10b981'], partial: ['Partially paid', '#f59e0b'], due: ['Due', '#ef4444'] };
  const items = rows.map(r => {
    const [label, color] = labels[r.status];
    return `<tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; color: #334155; font-size: 14px;"><strong>${r.name}</strong>${r.due_description ? `<br><span style="color: #64748b; font-size: 12px;">${r.due_description}</span>` : ''}</td>
              <td style="padding: 8px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; white-space: nowrap; color: #334155; font-size: 14px;">${formatCurrency(r.amount)}</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #e2e8f0; text-align: right; white-space: nowrap;"><span style="color: ${color}; font-weight: bold; font-size: 13px;">${label}</span></td>
            </tr>`;
  }).join('');
  return `<div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #6366f1; margin-top: 0;">Payment Schedule</h3>
            <table style="width: 100%; border-collapse: collapse;">${items}</table>
          </div>`;
}

// Insert line items for an invoice (no-op when empty)
async function insertInvoiceLines(supabase, invoiceId, lineItems) {
  if (!lineItems || lineItems.length === 0) return;
  const rows = lineItems.map(({ attribute_selections, ...row }) => ({
    ...row,
    invoice_id: invoiceId,
    ...(attribute_selections ? { attribute_selections } : {}),
  }));
  const { error } = await supabase.from('invoice_line_items').insert(rows);
  if (error) throw error;
}

module.exports = {
  pickSelectedPackage,
  buildInvoiceLines,
  invoiceHeaderFromQuote,
  resolveInvoicePaymentSchedule,
  buildPaymentScheduleRows,
  nextPaymentDue,
  paymentScheduleEmailHtml,
  insertInvoiceLines,
};
