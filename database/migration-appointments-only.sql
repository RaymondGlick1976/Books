-- =============================================
-- APPOINTMENTS - Standalone Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Appointment Types table (for the dropdown)
CREATE TABLE IF NOT EXISTS appointment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  icon VARCHAR(10) DEFAULT '📅',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default appointment types
INSERT INTO appointment_types (name, color, icon, sort_order) VALUES
  ('On-Site Estimate', '#8b5cf6', '📏', 0),
  ('Site Visit', '#3b82f6', '🏠', 1),
  ('Project Walkthrough', '#06b6d4', '👁️', 2),
  ('Punch-Out', '#f59e0b', '✅', 3),
  ('Quality Control', '#10b981', '🔍', 4),
  ('Payment Collection', '#ec4899', '💰', 5),
  ('Delivery', '#f97316', '🚚', 6),
  ('Other', '#64748b', '📅', 7)
ON CONFLICT DO NOTHING;

-- RLS for appointment_types
ALTER TABLE appointment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to appointment_types" ON appointment_types;
CREATE POLICY "Allow all access to appointment_types" ON appointment_types FOR ALL USING (true) WITH CHECK (true);

-- Appointments table (calendar events)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_type_id UUID REFERENCES appointment_types(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_deal ON appointments(deal_id);
CREATE INDEX IF NOT EXISTS idx_appointments_type ON appointments(appointment_type_id);

-- RLS for appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to appointments" ON appointments;
CREATE POLICY "Allow all access to appointments" ON appointments FOR ALL USING (true) WITH CHECK (true);
