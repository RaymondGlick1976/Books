-- =============================================
-- QUOTE PACKAGES - Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Packages table
CREATE TABLE IF NOT EXISTS quote_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2),  -- Optional override price (null = calculate from items)
  is_recommended BOOLEAN DEFAULT false,
  is_selected BOOLEAN DEFAULT false,
  apply_tax BOOLEAN DEFAULT false,
  tax_rate DECIMAL(5,3) DEFAULT 0,
  hide_non_included BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Package items table
CREATE TABLE IF NOT EXISTS quote_package_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES quote_packages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  quantity DECIMAL(10,2) DEFAULT 1,
  price DECIMAL(10,2) DEFAULT 0,
  is_included BOOLEAN DEFAULT true,  -- false = shown as excluded/crossed out
  show_price BOOLEAN DEFAULT true,   -- whether to show price to customer
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE quote_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to quote_packages" ON quote_packages;
CREATE POLICY "Allow all access to quote_packages" ON quote_packages FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to quote_package_items" ON quote_package_items;
CREATE POLICY "Allow all access to quote_package_items" ON quote_package_items FOR ALL USING (true) WITH CHECK (true);

-- Add packages_enabled flag to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS packages_enabled BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS selected_package_id UUID REFERENCES quote_packages(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quote_packages_quote_id ON quote_packages(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_package_items_package_id ON quote_package_items(package_id);
