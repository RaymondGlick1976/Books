-- =============================================
-- JOB EVENT TYPES MIGRATION
-- Run this if you already have the base jobs pipeline tables
-- =============================================

-- Job Event Types table (customizable calendar event types)
CREATE TABLE IF NOT EXISTS job_event_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  icon VARCHAR(10) DEFAULT '📅',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default event types
INSERT INTO job_event_types (name, color, icon, sort_order) VALUES
  ('Shop Date', '#f59e0b', '🔨', 0),
  ('Installation', '#10b981', '🏠', 1),
  ('Delivery', '#3b82f6', '🚚', 2),
  ('Measure', '#8b5cf6', '📏', 3),
  ('Follow-up', '#ec4899', '📞', 4)
ON CONFLICT DO NOTHING;

-- RLS for job_event_types
ALTER TABLE job_event_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to job_event_types" ON job_event_types;
CREATE POLICY "Allow all access to job_event_types" ON job_event_types FOR ALL USING (true) WITH CHECK (true);

-- Job Events table (events/dates for each job)
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

-- RLS for job_events
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to job_events" ON job_events;
CREATE POLICY "Allow all access to job_events" ON job_events FOR ALL USING (true) WITH CHECK (true);

-- Done! You can now customize event types and add events to jobs.

-- Add event_end_date column for date ranges
ALTER TABLE job_events ADD COLUMN IF NOT EXISTS event_end_date DATE;

-- Add job_finishes column to jobs table (v84)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_finishes JSONB DEFAULT '[]';
