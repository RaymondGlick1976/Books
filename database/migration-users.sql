-- =============================================
-- USERS & ROLES - Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Roles table with permissions
CREATE TABLE IF NOT EXISTS app_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  -- Permissions
  can_access_settings BOOLEAN DEFAULT false,
  can_view_financials BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_manage_users BOOLEAN DEFAULT false,
  can_send_invoices BOOLEAN DEFAULT false,
  can_edit_quotes BOOLEAN DEFAULT true,
  can_edit_customers BOOLEAN DEFAULT true,
  can_edit_pipeline BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,  -- System roles can't be deleted
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for roles
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to app_roles" ON app_roles;
CREATE POLICY "Allow all access to app_roles" ON app_roles FOR ALL USING (true) WITH CHECK (true);

-- Insert default roles
INSERT INTO app_roles (name, description, can_access_settings, can_view_financials, can_delete, can_manage_users, can_send_invoices, can_edit_quotes, can_edit_customers, can_edit_pipeline, is_system, sort_order) VALUES
  ('Admin', 'Full access to everything', true, true, true, true, true, true, true, true, true, 0),
  ('Office Manager', 'Manage quotes, invoices, customers. No settings access.', false, true, false, false, true, true, true, true, false, 1),
  ('Shop Manager', 'View and edit pipeline, customers, quotes. No financials.', false, false, false, false, false, true, true, true, false, 2),
  ('Installer', 'View assigned jobs and update status only.', false, false, false, false, false, false, false, true, false, 3)
ON CONFLICT (name) DO NOTHING;

-- Users table
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  pin VARCHAR(20) NOT NULL,
  role_id UUID REFERENCES app_roles(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to app_users" ON app_users;
CREATE POLICY "Allow all access to app_users" ON app_users FOR ALL USING (true) WITH CHECK (true);

-- Create default admin user (PIN: 1234)
INSERT INTO app_users (name, pin, role_id) 
SELECT 'Admin', '1234', id FROM app_roles WHERE name = 'Admin'
ON CONFLICT DO NOTHING;
