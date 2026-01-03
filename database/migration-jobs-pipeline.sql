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

-- Insert default stages
INSERT INTO job_stages (stage_id, label, color, sort_order) VALUES
  ('quotes', 'Quotes', '#64748b', 0),
  ('job-sold', 'Job Sold', '#10b981', 1),
  ('building', 'Building', '#3b82f6', 2),
  ('finishing', 'Finishing', '#f59e0b', 3),
  ('installation', 'Installation', '#ef4444', 4),
  ('punch-list', 'Punch List', '#ec4899', 5),
  ('completed', 'Completed', '#047857', 6),
  ('job-lost', 'Job Lost', '#6b7280', 7)
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

-- Allow service role full access (handled by service key)
-- For anon/authenticated, add policies as needed

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
