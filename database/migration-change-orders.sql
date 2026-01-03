-- =============================================
-- CHANGE ORDERS - Standalone Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Change Orders table
CREATE TABLE IF NOT EXISTS change_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  change_order_number VARCHAR(20) NOT NULL,
  title VARCHAR(255),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined')),
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Change Order Items table
CREATE TABLE IF NOT EXISTS change_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  change_order_id UUID REFERENCES change_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_change_orders_quote ON change_orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_change_order_items_co ON change_order_items(change_order_id);

-- Row Level Security
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_items ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (to avoid errors on re-run)
DROP POLICY IF EXISTS "Allow all access to change_orders" ON change_orders;
DROP POLICY IF EXISTS "Allow all access to change_order_items" ON change_order_items;

-- Create policies
CREATE POLICY "Allow all access to change_orders" ON change_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to change_order_items" ON change_order_items FOR ALL USING (true) WITH CHECK (true);

-- Function to generate change order number (starting at 11001)
CREATE OR REPLACE FUNCTION generate_change_order_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(change_order_number FROM '[0-9]+') AS INTEGER)), 11000) + 1
  INTO next_num
  FROM change_orders;
  RETURN next_num::TEXT;
END;
$$ LANGUAGE plpgsql;
