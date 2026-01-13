-- Migration: Pricing Attributes System
-- Run this in Supabase SQL Editor

-- Pricing attributes library (e.g., "Material Type", "Cabinet Size", "Labor Level")
CREATE TABLE IF NOT EXISTS pricing_attributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attribute options (e.g., Cherry $15/sq.ft., Maple $12/sq.ft.)
CREATE TABLE IF NOT EXISTS pricing_attribute_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attribute_id UUID REFERENCES pricing_attributes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_price DECIMAL(10,2) DEFAULT 0,
  pricing_type TEXT DEFAULT 'each' CHECK (pricing_type IN ('sqft', 'linft', 'each', 'percentage')),
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- For existing installations, add the new columns if they don't exist
DO $$ 
BEGIN
  -- Add pricing_type if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pricing_attribute_options' AND column_name = 'pricing_type') THEN
    ALTER TABLE pricing_attribute_options ADD COLUMN pricing_type TEXT DEFAULT 'each';
  END IF;
  
  -- Add unit_price if it doesn't exist (replaces flat_adjustment concept)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pricing_attribute_options' AND column_name = 'unit_price') THEN
    ALTER TABLE pricing_attribute_options ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0;
  END IF;
  
  -- Migrate data from flat_adjustment to unit_price if flat_adjustment exists
  IF EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pricing_attribute_options' AND column_name = 'flat_adjustment') THEN
    UPDATE pricing_attribute_options SET unit_price = COALESCE(flat_adjustment, 0) WHERE unit_price IS NULL OR unit_price = 0;
  END IF;
END $$;

-- Link catalog items to attributes they use
CREATE TABLE IF NOT EXISTS catalog_item_attributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID REFERENCES items_catalog(id) ON DELETE CASCADE,
  attribute_id UUID REFERENCES pricing_attributes(id) ON DELETE CASCADE,
  is_required BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(item_id, attribute_id)
);

-- Add column to quote_line_items to store selected attribute values
ALTER TABLE quote_line_items 
ADD COLUMN IF NOT EXISTS attribute_selections JSONB DEFAULT '[]';

-- The attribute_selections format:
-- [
--   { 
--     "attribute_id": "uuid", 
--     "attribute_name": "Material Type", 
--     "option_id": "uuid", 
--     "option_name": "Cherry", 
--     "unit_price": 15, 
--     "pricing_type": "sqft",
--     "quantity": 100,
--     "line_total": 1500
--   }
-- ]

-- Enable RLS
ALTER TABLE pricing_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_attribute_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_item_attributes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Allow public read pricing_attributes" ON pricing_attributes;
DROP POLICY IF EXISTS "Allow authenticated insert pricing_attributes" ON pricing_attributes;
DROP POLICY IF EXISTS "Allow authenticated update pricing_attributes" ON pricing_attributes;
DROP POLICY IF EXISTS "Allow authenticated delete pricing_attributes" ON pricing_attributes;
DROP POLICY IF EXISTS "Allow public read pricing_attribute_options" ON pricing_attribute_options;
DROP POLICY IF EXISTS "Allow authenticated insert pricing_attribute_options" ON pricing_attribute_options;
DROP POLICY IF EXISTS "Allow authenticated update pricing_attribute_options" ON pricing_attribute_options;
DROP POLICY IF EXISTS "Allow authenticated delete pricing_attribute_options" ON pricing_attribute_options;
DROP POLICY IF EXISTS "Allow public read catalog_item_attributes" ON catalog_item_attributes;
DROP POLICY IF EXISTS "Allow authenticated insert catalog_item_attributes" ON catalog_item_attributes;
DROP POLICY IF EXISTS "Allow authenticated update catalog_item_attributes" ON catalog_item_attributes;
DROP POLICY IF EXISTS "Allow authenticated delete catalog_item_attributes" ON catalog_item_attributes;

-- RLS Policies for pricing_attributes
CREATE POLICY "Allow public read pricing_attributes" ON pricing_attributes
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert pricing_attributes" ON pricing_attributes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update pricing_attributes" ON pricing_attributes
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete pricing_attributes" ON pricing_attributes
  FOR DELETE USING (true);

-- RLS Policies for pricing_attribute_options
CREATE POLICY "Allow public read pricing_attribute_options" ON pricing_attribute_options
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert pricing_attribute_options" ON pricing_attribute_options
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update pricing_attribute_options" ON pricing_attribute_options
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete pricing_attribute_options" ON pricing_attribute_options
  FOR DELETE USING (true);

-- RLS Policies for catalog_item_attributes
CREATE POLICY "Allow public read catalog_item_attributes" ON catalog_item_attributes
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert catalog_item_attributes" ON catalog_item_attributes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update catalog_item_attributes" ON catalog_item_attributes
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete catalog_item_attributes" ON catalog_item_attributes
  FOR DELETE USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pricing_attribute_options_attribute ON pricing_attribute_options(attribute_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_item ON catalog_item_attributes(item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_item_attributes_attribute ON catalog_item_attributes(attribute_id);
