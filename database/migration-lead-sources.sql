-- =============================================
-- LEAD SOURCES - Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Add lead_source column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_source VARCHAR(100);

-- Add company column to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company VARCHAR(255);

-- Create index for filtering by lead source
CREATE INDEX IF NOT EXISTS idx_customers_lead_source ON customers(lead_source);

-- Create lead_sources table for managing the dropdown options
CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Allow all access to lead_sources" ON lead_sources;

-- Create policy
CREATE POLICY "Allow all access to lead_sources" ON lead_sources FOR ALL USING (true) WITH CHECK (true);

-- Insert some common lead sources
INSERT INTO lead_sources (name, sort_order) VALUES
  ('Google Search', 1),
  ('Facebook', 2),
  ('Instagram', 3),
  ('Referral', 4),
  ('Repeat Customer', 5),
  ('Yard Sign', 6),
  ('Home Show', 7),
  ('Nextdoor', 8),
  ('Thumbtack', 9),
  ('Angi', 10),
  ('Other', 99)
ON CONFLICT (name) DO NOTHING;
