-- Migration: Add payment_method and selected_package_id to quotes table
-- Run this in Supabase SQL Editor

-- Add payment_method column to track how quote was accepted
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- Add selected_package_id column to track which bundle was selected
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS selected_package_id UUID REFERENCES quote_packages(id) ON DELETE SET NULL;

-- Create index for selected_package_id
CREATE INDEX IF NOT EXISTS idx_quotes_selected_package ON quotes(selected_package_id);
