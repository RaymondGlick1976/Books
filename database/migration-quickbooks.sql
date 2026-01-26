-- QuickBooks Online Integration
-- Stores OAuth tokens and entity mappings

-- Store QuickBooks connection settings
CREATE TABLE IF NOT EXISTS quickbooks_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id VARCHAR(50) NOT NULL, -- QuickBooks company ID
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add QuickBooks IDs to existing tables
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qb_customer_id VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qb_invoice_id VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qb_payment_id VARCHAR(50);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qb_synced_at TIMESTAMPTZ;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_customers_qb_id ON customers(qb_customer_id) WHERE qb_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_qb_id ON invoices(qb_invoice_id) WHERE qb_invoice_id IS NOT NULL;

-- RLS
ALTER TABLE quickbooks_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to quickbooks_connection" ON quickbooks_connection
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON quickbooks_connection TO authenticated;
GRANT ALL ON quickbooks_connection TO service_role;
