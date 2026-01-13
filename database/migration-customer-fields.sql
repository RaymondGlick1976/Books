-- =============================================
-- ENHANCED CUSTOMER FIELDS - Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Add first_name and last_name columns (keep name for backward compatibility)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Add lead_source_id foreign key (in addition to the text lead_source field)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL;

-- Add assigned_to (salesperson) and disable_drips
ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS disable_drips BOOLEAN DEFAULT false;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_lead_source_id ON customers(lead_source_id);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_to ON customers(assigned_to);

-- Add assigned_to and project_manager to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES app_users(id) ON DELETE SET NULL;

-- Add job address fields to jobs table (separate from customer address)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_street VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_city VARCHAR(100);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_state VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_zip VARCHAR(20);

-- Create indexes for jobs
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON jobs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_project_manager ON jobs(project_manager_id);

-- Backfill first_name and last_name from existing name field
UPDATE customers 
SET 
  first_name = SPLIT_PART(name, ' ', 1),
  last_name = CASE 
    WHEN POSITION(' ' IN name) > 0 
    THEN SUBSTRING(name FROM POSITION(' ' IN name) + 1)
    ELSE ''
  END
WHERE first_name IS NULL AND name IS NOT NULL;

-- Update the jobs_with_details view to include new fields
DROP VIEW IF EXISTS jobs_with_details;
CREATE OR REPLACE VIEW jobs_with_details AS
SELECT 
  j.*,
  c.name as customer_name,
  c.first_name as customer_first_name,
  c.last_name as customer_last_name,
  c.email as customer_email,
  c.phone as customer_phone,
  c.address as customer_address,
  c.city as customer_city,
  c.state as customer_state,
  c.zip as customer_zip,
  q.quote_number,
  q.total as quote_total,
  js.label as stage_label,
  js.color as stage_color,
  au.name as assigned_to_name,
  pm.name as project_manager_name
FROM jobs j
LEFT JOIN customers c ON j.customer_id = c.id
LEFT JOIN quotes q ON j.quote_id = q.id
LEFT JOIN job_stages js ON j.stage = js.stage_id
LEFT JOIN app_users au ON j.assigned_to = au.id
LEFT JOIN app_users pm ON j.project_manager_id = pm.id;
