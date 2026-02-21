-- Migration: Payment Schedules
-- Adds support for multiple payment schedules with customizable terms

-- Payment schedule templates (reusable default schedules)
CREATE TABLE IF NOT EXISTS payment_schedule_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment items within a template
CREATE TABLE IF NOT EXISTS payment_schedule_template_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES payment_schedule_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g., "Deposit", "Progress Payment", "Final Payment"
  due_description TEXT, -- e.g., "Due upon acceptance", "Due at 50% completion", "Due upon completion"
  amount_type TEXT NOT NULL CHECK (amount_type IN ('percentage', 'fixed')),
  amount_value DECIMAL(10,2) NOT NULL, -- percentage (0-100) or fixed dollar amount
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quote-specific payment schedule (copied from template or custom)
CREATE TABLE IF NOT EXISTS quote_payment_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  due_description TEXT,
  amount_type TEXT NOT NULL CHECK (amount_type IN ('percentage', 'fixed')),
  amount_value DECIMAL(10,2) NOT NULL,
  calculated_amount DECIMAL(10,2), -- Actual dollar amount based on quote total
  due_date DATE,
  is_paid BOOLEAN DEFAULT false,
  paid_date DATE,
  paid_amount DECIMAL(10,2),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add terms_and_conditions to company_settings if not exists
-- (This may already exist, so we use a DO block to check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'terms_and_conditions'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN terms_and_conditions TEXT;
  END IF;
END $$;

-- Add payment_schedule_template_id to quotes table to track which template was used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'payment_schedule_template_id'
  ) THEN
    ALTER TABLE quotes ADD COLUMN payment_schedule_template_id UUID REFERENCES payment_schedule_templates(id);
  END IF;
END $$;

-- Add payment_schedule JSONB column to quotes for storing the schedule
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'payment_schedule'
  ) THEN
    ALTER TABLE quotes ADD COLUMN payment_schedule JSONB;
  END IF;
END $$;

-- Add terms_and_conditions column to quotes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'quotes' AND column_name = 'terms_and_conditions'
  ) THEN
    ALTER TABLE quotes ADD COLUMN terms_and_conditions TEXT;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_template_items_template ON payment_schedule_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_quote_payment_schedule_quote ON quote_payment_schedule(quote_id);

-- Enable RLS
ALTER TABLE payment_schedule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_schedule_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_payment_schedule ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for authenticated users - adjust as needed)
DROP POLICY IF EXISTS "Allow all for payment_schedule_templates" ON payment_schedule_templates;
CREATE POLICY "Allow all for payment_schedule_templates" ON payment_schedule_templates FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for payment_schedule_template_items" ON payment_schedule_template_items;
CREATE POLICY "Allow all for payment_schedule_template_items" ON payment_schedule_template_items FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all for quote_payment_schedule" ON quote_payment_schedule;
CREATE POLICY "Allow all for quote_payment_schedule" ON quote_payment_schedule FOR ALL USING (true);

-- Insert a default payment schedule template
INSERT INTO payment_schedule_templates (name, description, is_default, is_active)
VALUES ('Standard 50/50', 'Half due at signing, half due upon completion', true, true)
ON CONFLICT DO NOTHING;

-- Get the template ID and insert items (using a DO block)
DO $$
DECLARE
  template_id UUID;
BEGIN
  SELECT id INTO template_id FROM payment_schedule_templates WHERE name = 'Standard 50/50' LIMIT 1;
  
  IF template_id IS NOT NULL THEN
    -- Only insert if no items exist for this template
    IF NOT EXISTS (SELECT 1 FROM payment_schedule_template_items WHERE template_id = template_id) THEN
      INSERT INTO payment_schedule_template_items (template_id, name, due_description, amount_type, amount_value, sort_order)
      VALUES 
        (template_id, 'Deposit', 'Due upon acceptance', 'percentage', 50, 0),
        (template_id, 'Final Payment', 'Due upon completion', 'percentage', 50, 1);
    END IF;
  END IF;
END $$;
