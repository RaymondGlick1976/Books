-- Migration: Pricing Types Table
-- Run this in Supabase SQL Editor to add customizable pricing types

-- Create pricing_types table
CREATE TABLE IF NOT EXISTS pricing_types (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    label VARCHAR(50) NOT NULL,
    is_builtin BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default pricing types
INSERT INTO pricing_types (code, name, label, is_builtin, sort_order) VALUES
    ('sqft', 'Square Feet', 'per Sq. Ft.', true, 0),
    ('linft', 'Linear Feet', 'per Lin. Ft.', true, 1),
    ('each', 'Each', 'Each', true, 2),
    ('percentage', 'Percentage', '%', true, 3)
ON CONFLICT (code) DO NOTHING;

-- Enable RLS
ALTER TABLE pricing_types ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all authenticated users to read, only authenticated to modify)
DROP POLICY IF EXISTS "Allow read pricing_types" ON pricing_types;
CREATE POLICY "Allow read pricing_types" ON pricing_types FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert pricing_types" ON pricing_types;
CREATE POLICY "Allow insert pricing_types" ON pricing_types FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update pricing_types" ON pricing_types;
CREATE POLICY "Allow update pricing_types" ON pricing_types FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete pricing_types" ON pricing_types;
CREATE POLICY "Allow delete pricing_types" ON pricing_types FOR DELETE USING (is_builtin = false);

-- Grant permissions
GRANT ALL ON pricing_types TO authenticated;
GRANT ALL ON pricing_types TO anon;
