-- =============================================
-- EMAIL TEMPLATES - Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('deal_stage', 'appointment')),
  stage_id VARCHAR(50) REFERENCES job_stages(stage_id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_stage ON email_templates(stage_id);

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Create policy
DROP POLICY IF EXISTS "Allow all access to email_templates" ON email_templates;
CREATE POLICY "Allow all access to email_templates" ON email_templates FOR ALL USING (true) WITH CHECK (true);

-- Create email_logs table to track sent emails
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  sent_by UUID REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_logs_customer ON email_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_deal ON email_logs(deal_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_appointment ON email_logs(appointment_id);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to email_logs" ON email_logs;
CREATE POLICY "Allow all access to email_logs" ON email_logs FOR ALL USING (true) WITH CHECK (true);

-- Insert a generic appointment reminder template (no stage_id needed)
INSERT INTO email_templates (name, subject, body, template_type, stage_id) VALUES
(
  'Appointment Reminder',
  'Reminder: {{appointment_type}} on {{appointment_date}}',
  'Hi {{first_name}},

This is a friendly reminder about your upcoming appointment:

📅 {{appointment_type}}
📆 Date: {{appointment_date}}
🕐 Time: {{appointment_time}}
📍 Location: {{appointment_location}}

If you need to reschedule, please let us know as soon as possible.

See you soon!

Best regards,
{{company_name}}',
  'appointment',
  NULL
)
ON CONFLICT DO NOTHING;

-- NOTE: Create deal stage templates from the Email Templates page
-- This ensures they use YOUR actual stage IDs from your pipeline
