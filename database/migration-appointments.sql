-- =============================================
-- APPOINTMENTS MIGRATION
-- Run this after the base jobs pipeline migration
-- =============================================

-- Appointment Types table (standalone calendar appointments)
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

-- Appointments table (standalone calendar events)
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

-- =============================================
-- BOOKING FORMS
-- =============================================
CREATE TABLE IF NOT EXISTS booking_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL DEFAULT 'Default',
  slug VARCHAR(100) UNIQUE NOT NULL,
  header_title VARCHAR(255) DEFAULT 'Appointment Request',
  header_description TEXT DEFAULT 'Choose a phone call or in-home appointment',
  
  -- Field visibility toggles
  show_service_details BOOLEAN DEFAULT true,
  show_date_time BOOLEAN DEFAULT false,
  show_address BOOLEAN DEFAULT true,
  show_how_heard BOOLEAN DEFAULT true,
  allow_attachments BOOLEAN DEFAULT true,
  attachments_required BOOLEAN DEFAULT false,
  attachments_label VARCHAR(255) DEFAULT 'Please add a few photos of your project',
  show_sms_consent BOOLEAN DEFAULT true,
  
  -- "How did you hear" options (JSON array)
  how_heard_options JSONB DEFAULT '["Google Search", "Facebook", "Instagram", "Referral", "Home Show", "Other"]',
  
  -- Styling
  primary_color VARCHAR(20) DEFAULT '#6366f1',
  
  -- Thank you page
  thank_you_title VARCHAR(255) DEFAULT 'Thank You!',
  thank_you_message TEXT DEFAULT 'We have received your request and will contact you shortly.',
  
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

CREATE INDEX idx_booking_submissions_form ON booking_submissions(form_id);
CREATE INDEX idx_booking_submissions_status ON booking_submissions(status);
CREATE INDEX idx_booking_forms_slug ON booking_forms(slug);

-- RLS
ALTER TABLE booking_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to booking_forms" ON booking_forms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to booking_form_questions" ON booking_form_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to booking_submissions" ON booking_submissions FOR ALL USING (true) WITH CHECK (true);

-- Insert default form
INSERT INTO booking_forms (name, slug, header_title, header_description) VALUES
  ('Default', 'default', 'Appointment Request', 'Choose a phone call or in-home appointment')
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- CHANGE ORDERS
-- =============================================
CREATE TABLE IF NOT EXISTS change_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  change_order_number VARCHAR(20) NOT NULL,
  title VARCHAR(255),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined')),
  subtotal DECIMAL(10,2) DEFAULT 0,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS change_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  change_order_id UUID REFERENCES change_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_change_orders_quote ON change_orders(quote_id);
CREATE INDEX idx_change_order_items_co ON change_order_items(change_order_id);

-- RLS
ALTER TABLE change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to change_orders" ON change_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to change_order_items" ON change_order_items FOR ALL USING (true) WITH CHECK (true);

-- Function to generate change order number
CREATE OR REPLACE FUNCTION generate_change_order_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(change_order_number FROM '[0-9]+') AS INTEGER)), 11000) + 1
  INTO next_num
  FROM change_orders;
  RETURN next_num::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Update default stages for full customer journey (optional - only if you want to reset stages)
-- DELETE FROM job_stages;
-- INSERT INTO job_stages (stage_id, label, color, sort_order) VALUES
--   ('new-lead', 'New Lead', '#64748b', 0),
--   ('measure-scheduled', 'Measure Scheduled', '#8b5cf6', 1),
--   ('quote-sent', 'Quote Sent', '#3b82f6', 2),
--   ('follow-up', 'Follow Up', '#f59e0b', 3),
--   ('job-sold', 'Job Sold', '#10b981', 4),
--   ('materials-ordered', 'Materials Ordered', '#06b6d4', 5),
--   ('building', 'Building', '#6366f1', 6),
--   ('finishing', 'Finishing', '#ec4899', 7),
--   ('ready-to-install', 'Ready to Install', '#f97316', 8),
--   ('completed', 'Completed', '#047857', 9),
--   ('lost', 'Lost', '#6b7280', 10);
