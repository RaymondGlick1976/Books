-- =============================================
-- INVOICE LINE <-> CHANGE ORDER LINK - Migration
-- Lets an invoice show which lines came from an accepted change order,
-- and stops the same change order being added to an invoice twice.
-- =============================================

ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS change_order_id UUID REFERENCES change_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_change_order ON invoice_line_items(change_order_id);
