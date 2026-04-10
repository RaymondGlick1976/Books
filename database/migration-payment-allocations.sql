-- =============================================
-- MIGRATION: Add payment_allocations to support split payments
-- =============================================
-- A single payment can now be split across multiple invoices.
-- The payments table remains the master record for a customer payment;
-- payment_allocations holds the per-invoice amounts.
-- =============================================

-- 1. Create the payment_allocations table
CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(invoice_id);

-- 2. Backfill: one allocation per existing succeeded payment with an invoice_id
INSERT INTO payment_allocations (payment_id, invoice_id, amount, created_at)
SELECT p.id, p.invoice_id, p.amount, p.created_at
FROM payments p
WHERE p.invoice_id IS NOT NULL
  AND p.status = 'succeeded'
  AND NOT EXISTS (SELECT 1 FROM payment_allocations a WHERE a.payment_id = p.id);

-- 3. Recalculation function: sum allocations for an invoice and update its totals
CREATE OR REPLACE FUNCTION recalculate_invoice_payments(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  total_paid DECIMAL(10,2);
  inv_total DECIMAL(10,2);
  current_status VARCHAR(20);
BEGIN
  IF p_invoice_id IS NULL THEN
    RETURN;
  END IF;

  SELECT total, status INTO inv_total, current_status
  FROM invoices WHERE id = p_invoice_id;

  IF inv_total IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(pa.amount), 0)
  INTO total_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.invoice_id = p_invoice_id AND p.status = 'succeeded';

  UPDATE invoices SET
    amount_paid = total_paid,
    amount_due = inv_total - total_paid,
    status = CASE
      WHEN total_paid >= inv_total AND inv_total > 0 THEN 'paid'
      WHEN total_paid > 0 THEN 'partial'
      WHEN current_status IN ('paid', 'partial') THEN 'sent'
      ELSE current_status
    END,
    paid_at = CASE
      WHEN total_paid >= inv_total AND inv_total > 0 THEN COALESCE(paid_at, NOW())
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger on payment_allocations: recalculate affected invoice(s)
CREATE OR REPLACE FUNCTION trigger_recalc_invoice_from_allocation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_invoice_payments(OLD.invoice_id);
    RETURN OLD;
  END IF;

  PERFORM recalculate_invoice_payments(NEW.invoice_id);
  IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    PERFORM recalculate_invoice_payments(OLD.invoice_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_allocations_recalc ON payment_allocations;
CREATE TRIGGER trigger_payment_allocations_recalc
AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION trigger_recalc_invoice_from_allocation();

-- 5. Replace the legacy payment trigger.
-- Legacy behavior: read SUM(payments.amount) directly.
-- New behavior:
--   * INSERT: auto-create an allocation when payment.invoice_id is set
--   * UPDATE amount: sync the single allocation (only when there's exactly one)
--   * UPDATE status: re-trigger recalc on all linked invoices
DROP TRIGGER IF EXISTS trigger_update_invoice_after_payment ON payments;

CREATE OR REPLACE FUNCTION sync_payment_to_allocations()
RETURNS TRIGGER AS $$
DECLARE
  alloc_count INTEGER;
  inv RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'succeeded' AND NEW.invoice_id IS NOT NULL THEN
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (NEW.id, NEW.invoice_id, NEW.amount);
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.status = 'succeeded' AND OLD.status IS DISTINCT FROM 'succeeded'
     AND NEW.invoice_id IS NOT NULL THEN
    SELECT COUNT(*) INTO alloc_count FROM payment_allocations WHERE payment_id = NEW.id;
    IF alloc_count = 0 THEN
      INSERT INTO payment_allocations (payment_id, invoice_id, amount)
      VALUES (NEW.id, NEW.invoice_id, NEW.amount);
    END IF;
  END IF;

  IF OLD.status = 'succeeded' AND NEW.status IS DISTINCT FROM 'succeeded' THEN
    FOR inv IN SELECT DISTINCT invoice_id FROM payment_allocations WHERE payment_id = NEW.id LOOP
      PERFORM recalculate_invoice_payments(inv.invoice_id);
    END LOOP;
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    SELECT COUNT(*) INTO alloc_count FROM payment_allocations WHERE payment_id = NEW.id;
    IF alloc_count = 1 THEN
      UPDATE payment_allocations SET amount = NEW.amount WHERE payment_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_payment_to_allocations
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION sync_payment_to_allocations();

-- 6. Recalculate every invoice after the migration to refresh amount_paid/amount_due/status
DO $$
DECLARE
  inv RECORD;
BEGIN
  FOR inv IN SELECT id FROM invoices LOOP
    PERFORM recalculate_invoice_payments(inv.id);
  END LOOP;
END $$;

-- 7. Enable RLS to mirror payments table
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
