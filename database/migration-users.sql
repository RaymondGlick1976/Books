-- =============================================
-- USERS & ROLES - Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Users table
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  pin VARCHAR(20) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'shop_manager' CHECK (role IN ('admin', 'shop_manager')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to app_users" ON app_users;
CREATE POLICY "Allow all access to app_users" ON app_users FOR ALL USING (true) WITH CHECK (true);

-- Create default admin user (PIN: 1234)
INSERT INTO app_users (name, pin, role) VALUES
  ('Admin', '1234', 'admin')
ON CONFLICT DO NOTHING;
