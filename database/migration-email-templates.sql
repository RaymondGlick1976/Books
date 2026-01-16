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

-- Insert some starter templates
INSERT INTO email_templates (name, subject, body, template_type, stage_id) VALUES
(
  'New Lead Welcome',
  'Thanks for reaching out - {{company_name}}',
  'Hi {{first_name}},

Thank you for contacting us about your cabinet project! We''re excited to learn more about what you have in mind.

We''ll be in touch shortly to schedule a time to discuss your project in more detail.

In the meantime, feel free to reply to this email with any questions.

Best regards,
{{company_name}}',
  'deal_stage',
  'new-lead'
),
(
  'Measure Scheduled',
  'Your measurement appointment is confirmed',
  'Hi {{first_name}},

Great news! Your measurement appointment has been scheduled.

We''ll see you soon to take measurements and discuss your project in person.

If you need to reschedule, please let us know as soon as possible.

Best regards,
{{company_name}}',
  'deal_stage',
  'measure-scheduled'
),
(
  'Quote Sent',
  'Your quote is ready - {{deal_name}}',
  'Hi {{first_name}},

Thank you for giving us the opportunity to quote your project!

Your quote for {{deal_name}} is ready for review. You can view it using the link we''ve provided.

Please don''t hesitate to reach out if you have any questions about the quote or would like to discuss any options.

Best regards,
{{company_name}}',
  'deal_stage',
  'quote-sent'
),
(
  'Job Sold - Thank You',
  'Thank you for your order! - {{deal_name}}',
  'Hi {{first_name}},

Thank you so much for choosing us for your {{deal_name}} project! We''re thrilled to be working with you.

Here''s what happens next:
1. We''ll order your materials
2. We''ll contact you to schedule your installation date
3. Our team will complete your beautiful new cabinets!

If you have any questions in the meantime, please don''t hesitate to reach out.

Best regards,
{{company_name}}',
  'deal_stage',
  'job-sold'
),
(
  'Installation Scheduled',
  'Your installation is scheduled!',
  'Hi {{first_name}},

Exciting news! Your installation has been scheduled for {{installation_date}}.

Please make sure the work area is accessible and cleared of any items that might be in the way.

We''ll see you soon!

Best regards,
{{company_name}}',
  'deal_stage',
  'ready-to-install'
),
(
  'Project Complete',
  'Your project is complete!',
  'Hi {{first_name}},

We''re happy to let you know that your {{deal_name}} project is now complete!

We hope you love your new cabinets. If you have any questions or notice anything that needs attention, please let us know right away.

We''d also really appreciate it if you could leave us a review - it helps other homeowners find us!

Thank you for choosing us!

Best regards,
{{company_name}}',
  'deal_stage',
  'completed'
),
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
