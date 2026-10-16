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
  insertInvoiceLines,
};
