-- =============================================
-- BOOKING FORMS - Standalone Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Booking Forms table
CREATE TABLE IF NOT EXISTS booking_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  
  -- Header customization
  header_title VARCHAR(255) DEFAULT 'Request an Appointment',
  header_description TEXT,
  
  -- Field visibility
  show_address BOOLEAN DEFAULT true,
  show_service_details BOOLEAN DEFAULT true,
  show_how_heard BOOLEAN DEFAULT true,
  show_date_time BOOLEAN DEFAULT false,
  allow_attachments BOOLEAN DEFAULT true,
  attachments_required BOOLEAN DEFAULT false,
  show_sms_consent BOOLEAN DEFAULT true,
  
  -- Customization
  primary_color VARCHAR(20) DEFAULT '#6366f1',
  how_heard_options JSONB DEFAULT '["Google Search", "Facebook", "Referral", "Repeat Customer", "Other"]',
  
  -- Thank you page
  thank_you_title VARCHAR(255) DEFAULT 'Thank You!',
  thank_you_message TEXT DEFAULT 'We have received your request and will be in touch shortly.',
  
  -- Pipeline integration
  default_stage VARCHAR(50) DEFAULT 'new-lead',
  
  is_active BOOLEAN DEFAULT true,
  submission_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom questions for forms
CREATE TABLE IF NOT EXISTS booking_form_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID REFERENCES booking_forms(id) ON DELETE CASCADE,
  prompt VARCHAR(255) NOT NULL,
  field_type VARCHAR(20) DEFAULT 'text' CHECK (field_type IN ('text', 'textarea', 'dropdown', 'checkbox', 'radio')),
  choices JSONB, -- For dropdown/radio: ["Option 1", "Option 2"]
  is_required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form submissions (leads)
CREATE TABLE IF NOT EXISTS booking_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID REFERENCES booking_forms(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  
  -- Contact info
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  
  -- Address
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  
  -- Details
  service_details TEXT,
  how_heard VARCHAR(100),
  preferred_date DATE,
  preferred_time TIME,
  sms_consent BOOLEAN DEFAULT false,
  
  -- Custom answers (JSON object: { question_id: answer })
  custom_answers JSONB,
  
  -- Attachments (JSON array of URLs)
  attachments JSONB,
  
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_booking_submissions_form ON booking_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_booking_submissions_status ON booking_submissions(status);
CREATE INDEX IF NOT EXISTS idx_booking_forms_slug ON booking_forms(slug);

-- Row Level Security
ALTER TABLE booking_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_submissions ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (to avoid errors on re-run)
DROP POLICY IF EXISTS "Allow all access to booking_forms" ON booking_forms;
DROP POLICY IF EXISTS "Allow all access to booking_form_questions" ON booking_form_questions;
DROP POLICY IF EXISTS "Allow all access to booking_submissions" ON booking_submissions;

-- Create policies
CREATE POLICY "Allow all access to booking_forms" ON booking_forms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to booking_form_questions" ON booking_form_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to booking_submissions" ON booking_submissions FOR ALL USING (true) WITH CHECK (true);

-- Insert default form
INSERT INTO booking_forms (name, slug, header_title, header_description) VALUES
  ('Default', 'default', 'Appointment Request', 'Choose a phone call or in-home appointment')
ON CONFLICT (slug) DO NOTHING;
