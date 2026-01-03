-- =============================================
-- DEALS PIPELINE - COMPLETE MIGRATION
-- Run this in Supabase SQL Editor
-- This adds all tables needed for the pipeline to work fully
-- =============================================

-- =============================================
-- 1. JOB EVENT TYPES (for deal events on calendar)
-- =============================================
CREATE TABLE IF NOT EXISTS job_event_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  icon VARCHAR(10) DEFAULT '📅',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO job_event_types (name, color, icon, sort_order) VALUES
  ('Shop Date', '#f59e0b', '🔨', 0),
  ('Installation', '#10b981', '🏠', 1),
  ('Delivery', '#3b82f6', '🚚', 2),
  ('Measure', '#8b5cf6', '📏', 3),
  ('Follow-up', '#ec4899', '📞', 4)
ON CONFLICT DO NOTHING;

ALTER TABLE job_event_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to job_event_types" ON job_event_types;
CREATE POLICY "Allow all access to job_event_types" ON job_event_types FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 2. JOB EVENTS (dates attached to deals)
-- =============================================
CREATE TABLE IF NOT EXISTS job_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  event_type_id UUID REFERENCES job_event_types(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  notes TEXT,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);
CREATE INDEX IF NOT EXISTS idx_job_events_date ON job_events(event_date);
CREATE INDEX IF NOT EXISTS idx_job_events_type ON job_events(event_type_id);

ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to job_events" ON job_events;
CREATE POLICY "Allow all access to job_events" ON job_events FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 3. APPOINTMENT TYPES (for standalone calendar appointments)
-- =============================================
CREATE TABLE IF NOT EXISTS appointment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  icon VARCHAR(10) DEFAULT '📅',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

ALTER TABLE appointment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to appointment_types" ON appointment_types;
CREATE POLICY "Allow all access to appointment_types" ON appointment_types FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 4. APPOINTMENTS (standalone calendar events)
-- =============================================
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

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to appointments" ON appointments;
CREATE POLICY "Allow all access to appointments" ON appointments FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- DONE! Pipeline should now be fully functional
-- =============================================
