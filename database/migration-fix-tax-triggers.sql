-- =============================================
-- MIGRATION: Fix tax calculation triggers to respect is_taxable flag
-- =============================================
-- The previous triggers applied tax to ALL line items regardless of the
-- is_taxable column. This caused invoices/quotes with mixed taxable/non-taxable
-- items to be over-taxed, and any line item edit would re-introduce tax even
-- after the JS layer correctly removed it.
-- =============================================

-- 1. Fix update_quote_totals
CREATE OR REPLACE FUNCTION update_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
  quote_record RECORD;
  calc_subtotal DECIMAL(10,2);
  calc_subtotal_low DECIMAL(10,2);
  calc_subtotal_high DECIMAL(10,2);
  calc_taxable_subtotal DECIMAL(10,2);
  calc_taxable_subtotal_low DECIMAL(10,2);
  calc_taxable_subtotal_high DECIMAL(10,2);
  calc_tax DECIMAL(10,2);
  calc_total DECIMAL(10,2);
  calc_total_low DECIMAL(10,2);
  calc_total_high DECIMAL(10,2);
  calc_deposit DECIMAL(10,2);
  has_ranges BOOLEAN;
  effective_tax_rate DECIMAL(10,6);
BEGIN
  -- Get quote settings
  SELECT * INTO quote_record FROM quotes WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);
  effective_tax_rate := COALESCE(quote_record.tax_rate, 0);

  -- Calculate subtotals (all selected items + taxable-only sums)
  SELECT
    COALESCE(SUM(CASE WHEN NOT is_optional OR is_selected THEN line_total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_optional OR is_selected THEN COALESCE(line_total_low, line_total) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_optional OR is_selected THEN COALESCE(line_total_high, line_total) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (NOT is_optional OR is_selected) AND is_taxable THEN line_total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (NOT is_optional OR is_selected) AND is_taxable THEN COALESCE(line_total_low, line_total) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN (NOT is_optional OR is_selected) AND is_taxable THEN COALESCE(line_total_high, line_total) ELSE 0 END), 0),
    BOOL_OR(is_range_pricing)
  INTO calc_subtotal, calc_subtotal_low, calc_subtotal_high,
       calc_taxable_subtotal, calc_taxable_subtotal_low, calc_taxable_subtotal_high,
       has_ranges
  FROM quote_line_items
  WHERE quote_id = quote_record.id;

  -- Calculate tax and totals (only taxable items get tax applied)
  calc_tax := calc_taxable_subtotal * effective_tax_rate;
  calc_total := calc_subtotal + calc_tax;
  calc_total_low := calc_subtotal_low + (calc_taxable_subtotal_low * effective_tax_rate);
  calc_total_high := calc_subtotal_high + (calc_taxable_subtotal_high * effective_tax_rate);

  -- Calculate deposit
  IF quote_record.deposit_type = 'percentage' THEN
    calc_deposit := calc_subtotal_low * (quote_record.deposit_value / 100);
  ELSE
    calc_deposit := quote_record.deposit_value;
  END IF;

  -- Update quote
  UPDATE quotes SET
    subtotal = calc_subtotal,
    subtotal_low = CASE WHEN has_ranges THEN calc_subtotal_low ELSE NULL END,
    subtotal_high = CASE WHEN has_ranges THEN calc_subtotal_high ELSE NULL END,
    tax_amount = calc_tax,
    total = calc_total,
    total_low = CASE WHEN has_ranges THEN calc_total_low ELSE NULL END,
    total_high = CASE WHEN has_ranges THEN calc_total_high ELSE NULL END,
    deposit_amount = calc_deposit,
    updated_at = NOW()
  WHERE id = quote_record.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix update_invoice_totals
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  invoice_record RECORD;
  calc_subtotal DECIMAL(10,2);
  calc_taxable_subtotal DECIMAL(10,2);
  calc_tax DECIMAL(10,2);
  calc_total DECIMAL(10,2);
BEGIN
  SELECT * INTO invoice_record FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT
    COALESCE(SUM(line_total), 0),
    COALESCE(SUM(CASE WHEN is_taxable THEN line_total ELSE 0 END), 0)
  INTO calc_subtotal, calc_taxable_subtotal
  FROM invoice_line_items
  WHERE invoice_id = invoice_record.id;

  calc_tax := calc_taxable_subtotal * COALESCE(invoice_record.tax_rate, 0);
  calc_total := calc_subtotal + calc_tax;

  UPDATE invoices SET
    subtotal = calc_subtotal,
    tax_amount = calc_tax,
    total = calc_total,
    amount_due = calc_total - amount_paid,
    updated_at = NOW()
  WHERE id = invoice_record.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Recalculate all existing invoices using the corrected formula
UPDATE invoices i
SET
  subtotal = sub.total_subtotal,
  tax_amount = sub.taxable_subtotal * COALESCE(i.tax_rate, 0),
  total = sub.total_subtotal + (sub.taxable_subtotal * COALESCE(i.tax_rate, 0)),
  amount_due = (sub.total_subtotal + (sub.taxable_subtotal * COALESCE(i.tax_rate, 0))) - COALESCE(i.amount_paid, 0),
  updated_at = NOW()
FROM (
  SELECT
    invoice_id,
    COALESCE(SUM(line_total), 0) AS total_subtotal,
    COALESCE(SUM(CASE WHEN is_taxable THEN line_total ELSE 0 END), 0) AS taxable_subtotal
  FROM invoice_line_items
  GROUP BY invoice_id
) sub
WHERE i.id = sub.invoice_id;

-- 4. Recalculate all existing quotes using the corrected formula
UPDATE quotes q
SET
  subtotal = sub.total_subtotal,
  tax_amount = sub.taxable_subtotal * COALESCE(q.tax_rate, 0),
  total = sub.total_subtotal + (sub.taxable_subtotal * COALESCE(q.tax_rate, 0)),
  updated_at = NOW()
FROM (
  SELECT
    quote_id,
    COALESCE(SUM(CASE WHEN NOT is_optional OR is_selected THEN line_total ELSE 0 END), 0) AS total_subtotal,
    COALESCE(SUM(CASE WHEN (NOT is_optional OR is_selected) AND is_taxable THEN line_total ELSE 0 END), 0) AS taxable_subtotal
  FROM quote_line_items
  GROUP BY quote_id
) sub
WHERE q.id = sub.quote_id;
