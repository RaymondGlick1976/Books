-- =============================================
-- JOBS PIPELINE MIGRATION
-- Run this in your Supabase SQL editor AFTER the main schema
-- =============================================

-- =============================================
-- JOB STAGES (Customizable pipeline stages)
-- =============================================
CREATE TABLE IF NOT EXISTS job_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stage_id VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#6366f1',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default stages (full customer journey)
INSERT INTO job_stages (stage_id, label, color, sort_order) VALUES
  ('new-lead', 'New Lead', '#64748b', 0),
  ('measure-scheduled', 'Measure Scheduled', '#8b5cf6', 1),
  ('quote-sent', 'Quote Sent', '#3b82f6', 2),
  ('follow-up', 'Follow Up', '#f59e0b', 3),
  ('job-sold', 'Job Sold', '#10b981', 4),
  ('materials-ordered', 'Materials Ordered', '#06b6d4', 5),
  ('building', 'Building', '#6366f1', 6),
  ('finishing', 'Finishing', '#ec4899', 7),
  ('ready-to-install', 'Ready to Install', '#f97316', 8),
  ('completed', 'Completed', '#047857', 9),
  ('lost', 'Lost', '#6b7280', 10)
ON CONFLICT (stage_id) DO NOTHING;

-- =============================================
-- JOBS (Main jobs table)
-- =============================================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  stage VARCHAR(50) DEFAULT 'quotes' REFERENCES job_stages(stage_id),
  
  -- Dates
  shop_date DATE,
  installation_date DATE,
  completed_date DATE,
  
  -- Job details (stored as JSONB for flexibility)
  job_items JSONB DEFAULT '[]',
  colors JSONB DEFAULT '[]',
  refacing_materials TEXT,
  
  -- Financial
  estimated_value DECIMAL(10, 2),
  actual_value DECIMAL(10, 2),
  
  -- Notes
  notes TEXT,
  internal_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_quote ON jobs(quote_id);
CREATE INDEX idx_jobs_stage ON jobs(stage);
CREATE INDEX idx_jobs_shop_date ON jobs(shop_date);
CREATE INDEX idx_jobs_installation_date ON jobs(installation_date);

-- =============================================
-- JOB PHOTOS
-- =============================================
CREATE TABLE IF NOT EXISTS job_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  name VARCHAR(255),
  file_url TEXT,
  file_data TEXT, -- Base64 for small images, or use Supabase Storage
  photo_type VARCHAR(50) DEFAULT 'progress', -- 'before', 'progress', 'after'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_photos_job ON job_photos(job_id);

-- =============================================
-- JOB NUMBER GENERATOR
-- =============================================
INSERT INTO settings (key, value) VALUES
  ('next_job_number', '{"value": 1001}')
ON CONFLICT (key) DO NOTHING;

-- Function to generate next job number
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS VARCHAR AS $$
DECLARE
  next_num INTEGER;
  year_prefix VARCHAR;
BEGIN
  SELECT (value->>'value')::INTEGER INTO next_num FROM settings WHERE key = 'next_job_number';
  year_prefix := TO_CHAR(NOW(), 'YYYY');
  UPDATE settings SET value = jsonb_set(value, '{value}', to_jsonb(next_num + 1)) WHERE key = 'next_job_number';
  RETURN 'JOB-' || year_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- AUTO-CREATE JOB WHEN QUOTE ACCEPTED
-- =============================================
CREATE OR REPLACE FUNCTION create_job_from_quote()
RETURNS TRIGGER AS $$
DECLARE
  new_job_number VARCHAR;
  quote_record RECORD;
  customer_record RECORD;
BEGIN
  -- Only trigger when status changes to 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    -- Get quote details
    SELECT * INTO quote_record FROM quotes WHERE id = NEW.id;
    SELECT * INTO customer_record FROM customers WHERE id = quote_record.customer_id;
    
    -- Generate job number
    new_job_number := generate_job_number();
    
    -- Create the job
    INSERT INTO jobs (
      job_number,
      name,
      customer_id,
      quote_id,
      stage,
      estimated_value,
      notes
    ) VALUES (
      new_job_number,
      quote_record.title,
      quote_record.customer_id,
      quote_record.id,
      'job-sold',
      quote_record.total,
      'Created from quote ' || quote_record.quote_number
    );
    
    -- Update quote status to converted
    UPDATE quotes SET status = 'converted' WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for quote acceptance
DROP TRIGGER IF EXISTS trigger_create_job_from_quote ON quotes;
CREATE TRIGGER trigger_create_job_from_quote
AFTER UPDATE OF status ON quotes
FOR EACH ROW
WHEN (NEW.status = 'accepted')
EXECUTE FUNCTION create_job_from_quote();

-- =============================================
-- UPDATE JOB STAGE HELPER
-- =============================================
CREATE OR REPLACE FUNCTION update_job_stage(
  p_job_id UUID,
  p_new_stage VARCHAR
)
RETURNS VOID AS $$
BEGIN
  UPDATE jobs 
  SET 
    stage = p_new_stage,
    updated_at = NOW(),
    completed_date = CASE WHEN p_new_stage = 'completed' THEN NOW() ELSE completed_date END
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE job_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

-- Policies for job_stages (allow all operations for anon - admin app uses anon key)
CREATE POLICY "Allow all access to job_stages" ON job_stages FOR ALL USING (true) WITH CHECK (true);

-- Policies for jobs
CREATE POLICY "Allow all access to jobs" ON jobs FOR ALL USING (true) WITH CHECK (true);

-- Policies for job_photos
CREATE POLICY "Allow all access to job_photos" ON job_photos FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- JOB EVENT TYPES (Customizable calendar event types)
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

-- Insert default event types
INSERT INTO job_event_types (name, color, icon, sort_order) VALUES
  ('Shop Date', '#f59e0b', '🔨', 0),
  ('Installation', '#10b981', '🏠', 1),
  ('Delivery', '#3b82f6', '🚚', 2),
  ('Measure', '#8b5cf6', '📏', 3),
  ('Follow-up', '#ec4899', '📞', 4)
ON CONFLICT DO NOTHING;

-- =============================================
-- APPOINTMENT TYPES (Standalone calendar appointments)
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
CREATE POLICY "Allow all access to appointment_types" ON appointment_types FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- APPOINTMENTS (Standalone calendar events)
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

CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_appointments_deal ON appointments(deal_id);
CREATE INDEX idx_appointments_type ON appointments(appointment_type_id);

-- RLS for appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to appointments" ON appointments FOR ALL USING (true) WITH CHECK (true);

-- RLS for job_event_types
ALTER TABLE job_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to job_event_types" ON job_event_types FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- JOB EVENTS (Events/dates for each job)
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

CREATE INDEX idx_job_events_job ON job_events(job_id);
CREATE INDEX idx_job_events_date ON job_events(event_date);
CREATE INDEX idx_job_events_type ON job_events(event_type_id);

-- RLS for job_events
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to job_events" ON job_events FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- VIEWS FOR DASHBOARD
-- =============================================
CREATE OR REPLACE VIEW job_pipeline_summary AS
SELECT 
  js.stage_id,
  js.label,
  js.color,
  js.sort_order,
  COUNT(j.id) as job_count,
  COALESCE(SUM(j.estimated_value), 0) as total_value
FROM job_stages js
LEFT JOIN jobs j ON j.stage = js.stage_id
WHERE js.is_active = true
GROUP BY js.id, js.stage_id, js.label, js.color, js.sort_order
ORDER BY js.sort_order;

-- Jobs with customer info view
CREATE OR REPLACE VIEW jobs_with_details AS
SELECT 
  j.*,
  c.name as customer_name,
  c.email as customer_email,
  c.phone as customer_phone,
  c.address as customer_address,
  c.city as customer_city,
  q.quote_number,
  q.total as quote_total,
  js.label as stage_label,
  js.color as stage_color
FROM jobs j
LEFT JOIN customers c ON j.customer_id = c.id
LEFT JOIN quotes q ON j.quote_id = q.id
LEFT JOIN job_stages js ON j.stage = js.stage_id;
