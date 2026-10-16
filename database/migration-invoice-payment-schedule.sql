-- =============================================
-- INVOICE PAYMENT SCHEDULE - Migration
-- Copies the quote's payment schedule onto the invoice when it is created.
-- =============================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_schedule JSONB;
