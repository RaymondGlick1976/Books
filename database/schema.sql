-- =============================================
-- HOMESTEAD CABINET DESIGN - DATABASE SCHEMA
-- Run this in your Supabase SQL editor
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CUSTOMERS
-- =============================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  notes TEXT,
  portal_token UUID DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_portal_token ON customers(portal_token);

-- =============================================
-- AUTH TOKENS (Magic Links & Sessions)
-- =============================================
CREATE TABLE auth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  token UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('magic_link', 'session')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address VARCHAR(50),
  user_agent TEXT
);

CREATE INDEX idx_auth_tokens_token ON auth_tokens(token);
CREATE INDEX idx_auth_tokens_customer ON auth_tokens(customer_id);

-- =============================================
-- ITEMS CATALOG
-- =============================================
CREATE TABLE items_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  default_price DECIMAL(10, 2),
  price_range_low DECIMAL(10, 2),
  price_range_high DECIMAL(10, 2),
  photo_url TEXT,
  is_taxable BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_items_catalog_category ON items_catalog(category);
CREATE INDEX idx_items_catalog_active ON items_catalog(is_active);

-- =============================================
-- QUOTES
-- =============================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted')),
  quote_type VARCHAR(20) DEFAULT 'final' CHECK (quote_type IN ('ballpark', 'final')),
  subtotal DECIMAL(10, 2) DEFAULT 0,
  subtotal_low DECIMAL(10, 2),
  subtotal_high DECIMAL(10, 2),
  tax_rate DECIMAL(5, 4) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) DEFAULT 0,
  total_low DECIMAL(10, 2),
  total_high DECIMAL(10, 2),
  deposit_type VARCHAR(20) DEFAULT 'percentage' CHECK (deposit_type IN ('percentage', 'fixed')),
  deposit_value DECIMAL(10, 2) DEFAULT 50,
  deposit_amount DECIMAL(10, 2),
  video_url TEXT,
  notes TEXT,
  internal_notes TEXT,
  valid_days INTEGER DEFAULT 30,
  access_token VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_quotes_customer ON quotes(customer_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_number ON quotes(quote_number);
CREATE INDEX idx_quotes_token ON quotes(access_token);

-- =============================================
-- QUOTE LINE ITEMS
-- =============================================
CREATE TABLE quote_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES items_catalog(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  details TEXT,
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'each',
  unit_price DECIMAL(10, 2),
  price_range_low DECIMAL(10, 2),
  price_range_high DECIMAL(10, 2),
  is_range_pricing BOOLEAN DEFAULT false,
  line_total DECIMAL(10, 2),
  line_total_low DECIMAL(10, 2),
  line_total_high DECIMAL(10, 2),
  photo_url TEXT,
  is_optional BOOLEAN DEFAULT false,
  is_selected BOOLEAN DEFAULT false,
  is_taxable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quote_line_items_quote ON quote_line_items(quote_id);

-- =============================================
-- QUOTE ATTACHMENTS
-- =============================================
CREATE TABLE quote_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  display_order INTEGER DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quote_attachments_quote ON quote_attachments(quote_id);

-- =============================================
-- INVOICES
-- =============================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled')),
  subtotal DECIMAL(10, 2) DEFAULT 0,
  tax_rate DECIMAL(5, 4) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) DEFAULT 0,
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  amount_due DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);

CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_quote ON invoices(quote_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);

-- =============================================
-- INVOICE LINE ITEMS
-- =============================================
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  details TEXT,
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'each',
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(10, 2) NOT NULL,
  is_taxable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

-- =============================================
-- PAYMENTS
-- =============================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_type VARCHAR(50) DEFAULT 'card' CHECK (payment_type IN ('card', 'cash', 'check', 'other', 'deposit', 'progress', 'final')),
  payment_method VARCHAR(100),
  reference_number VARCHAR(100),
  stripe_payment_intent_id VARCHAR(255),
  stripe_charge_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded')),
  notes TEXT,
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_intent_id);

-- =============================================
-- CUSTOMER UPLOADS
-- =============================================
CREATE TABLE customer_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  caption TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_uploads_customer ON customer_uploads(customer_id);
CREATE INDEX idx_customer_uploads_quote ON customer_uploads(quote_id);

-- =============================================
-- NOTIFICATION QUEUE
-- =============================================
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  is_admin_notification BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_queue_pending ON notification_queue(scheduled_for) WHERE sent_at IS NULL;

-- =============================================
-- NOTIFICATIONS LOG
-- =============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  subject VARCHAR(255),
  body_html TEXT,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_customer ON notifications(customer_id);

-- =============================================
-- ACTIVITY LOG
-- =============================================
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  reference_type VARCHAR(50),
  reference_id UUID,
  description TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_log_customer ON activity_log(customer_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at);

-- =============================================
-- SETTINGS
-- =============================================
CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('company', '{"name": "Homestead Cabinet Design", "email": "raymond@homesteadcabinetdesign.com", "phone": "", "address": "", "city": "", "state": "MA", "zip": ""}'),
  ('quote_defaults', '{"valid_days": 30, "deposit_type": "percentage", "deposit_value": 50, "tax_rate": 0.0625}'),
  ('invoice_defaults', '{"due_days": 30, "tax_rate": 0.0625}'),
  ('next_quote_number', '{"value": 1001}'),
  ('next_invoice_number', '{"value": 1001}');

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to generate next quote number
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS VARCHAR AS $$
DECLARE
  next_num INTEGER;
  year_prefix VARCHAR;
BEGIN
  SELECT (value->>'value')::INTEGER INTO next_num FROM settings WHERE key = 'next_quote_number';
  year_prefix := TO_CHAR(NOW(), 'YYYY');
  UPDATE settings SET value = jsonb_set(value, '{value}', to_jsonb(next_num + 1)) WHERE key = 'next_quote_number';
  RETURN 'Q-' || year_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to generate next invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR AS $$
DECLARE
  next_num INTEGER;
  year_prefix VARCHAR;
BEGIN
  SELECT (value->>'value')::INTEGER INTO next_num FROM settings WHERE key = 'next_invoice_number';
  year_prefix := TO_CHAR(NOW(), 'YYYY');
  UPDATE settings SET value = jsonb_set(value, '{value}', to_jsonb(next_num + 1)) WHERE key = 'next_invoice_number';
  RETURN 'INV-' || year_prefix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to update quote totals
CREATE OR REPLACE FUNCTION update_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
  quote_record RECORD;
  calc_subtotal DECIMAL(10,2);
  calc_subtotal_low DECIMAL(10,2);
  calc_subtotal_high DECIMAL(10,2);
  calc_tax DECIMAL(10,2);
  calc_total DECIMAL(10,2);
  calc_total_low DECIMAL(10,2);
  calc_total_high DECIMAL(10,2);
  calc_deposit DECIMAL(10,2);
  has_ranges BOOLEAN;
BEGIN
  -- Get quote settings
  SELECT * INTO quote_record FROM quotes WHERE id = COALESCE(NEW.quote_id, OLD.quote_id);
  
  -- Calculate subtotals
  SELECT 
    COALESCE(SUM(CASE WHEN NOT is_optional OR is_selected THEN line_total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_optional OR is_selected THEN COALESCE(line_total_low, line_total) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT is_optional OR is_selected THEN COALESCE(line_total_high, line_total) ELSE 0 END), 0),
    BOOL_OR(is_range_pricing)
  INTO calc_subtotal, calc_subtotal_low, calc_subtotal_high, has_ranges
  FROM quote_line_items 
  WHERE quote_id = quote_record.id;
  
  -- Calculate tax and totals
  calc_tax := calc_subtotal * quote_record.tax_rate;
  calc_total := calc_subtotal + calc_tax;
  calc_total_low := calc_subtotal_low + (calc_subtotal_low * quote_record.tax_rate);
  calc_total_high := calc_subtotal_high + (calc_subtotal_high * quote_record.tax_rate);
  
  -- Calculate deposit
  IF quote_record.deposit_type = 'percentage' THEN
    calc_deposit := calc_subtotal_low * (quote_record.deposit_value / 100);
  ELSE
    calc_deposit := quote_record.deposit_value;
  END IF;
  
  -- Update quote
  UPDATE quotes SET
    subtotal = calc_subtotal,
    subtotal_low = CASE WHEN has_ranges THEN calc_subtotal_low ELSE NULL END,
    subtotal_high = CASE WHEN has_ranges THEN calc_subtotal_high ELSE NULL END,
    tax_amount = calc_tax,
    total = calc_total,
    total_low = CASE WHEN has_ranges THEN calc_total_low ELSE NULL END,
    total_high = CASE WHEN has_ranges THEN calc_total_high ELSE NULL END,
    deposit_amount = calc_deposit,
    updated_at = NOW()
  WHERE id = quote_record.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for quote line item changes
CREATE TRIGGER trigger_update_quote_totals
AFTER INSERT OR UPDATE OR DELETE ON quote_line_items
FOR EACH ROW EXECUTE FUNCTION update_quote_totals();

-- Function to update invoice totals
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  invoice_record RECORD;
  calc_subtotal DECIMAL(10,2);
  calc_tax DECIMAL(10,2);
  calc_total DECIMAL(10,2);
BEGIN
  SELECT * INTO invoice_record FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  SELECT COALESCE(SUM(line_total), 0) INTO calc_subtotal
  FROM invoice_line_items WHERE invoice_id = invoice_record.id;
  
  calc_tax := calc_subtotal * invoice_record.tax_rate;
  calc_total := calc_subtotal + calc_tax;
  
  UPDATE invoices SET
    subtotal = calc_subtotal,
    tax_amount = calc_tax,
    total = calc_total,
    amount_due = calc_total - amount_paid,
    updated_at = NOW()
  WHERE id = invoice_record.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for invoice line item changes
CREATE TRIGGER trigger_update_invoice_totals
AFTER INSERT OR UPDATE OR DELETE ON invoice_line_items
FOR EACH ROW EXECUTE FUNCTION update_invoice_totals();

-- Function to update invoice after payment
CREATE OR REPLACE FUNCTION update_invoice_after_payment()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(10,2);
  invoice_total DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments 
  WHERE invoice_id = NEW.invoice_id AND status = 'succeeded';
  
  SELECT total INTO invoice_total FROM invoices WHERE id = NEW.invoice_id;
  
  UPDATE invoices SET
    amount_paid = total_paid,
    amount_due = total - total_paid,
    status = CASE 
      WHEN total_paid >= invoice_total THEN 'paid'
      WHEN total_paid > 0 THEN 'partial'
      ELSE status
    END,
    paid_at = CASE WHEN total_paid >= invoice_total THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment changes
CREATE TRIGGER trigger_update_invoice_after_payment
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_after_payment();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- For service role (admin), allow all operations
-- These policies use the service_role key which bypasses RLS

-- Create a policy for anon users to read their own data via portal token
-- (You'll handle most auth in your serverless functions with service role)

-- =============================================
-- STORAGE BUCKETS (Run in Supabase Dashboard)
-- =============================================
-- Create these buckets in Supabase Storage:
-- 1. quote-attachments (private)
-- 2. customer-uploads (private)  
-- 3. catalog-photos (public)
