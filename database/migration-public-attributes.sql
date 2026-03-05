-- Migration: Public Attributes
-- Allows pricing attributes to be marked as customer-selectable on quotes
-- Adds base_price to quote_line_items for accurate server-side price recalculation

-- Add is_public flag to pricing_attributes
ALTER TABLE pricing_attributes
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Add base_price to quote_line_items (stores the price before attribute adjustments)
ALTER TABLE quote_line_items
ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT NULL;

-- Add base_price to quote_package_items as well for consistency
ALTER TABLE quote_package_items
ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT NULL;
