-- =============================================
-- ADD VIEW PERMISSIONS - Migration
-- Run this in Supabase SQL Editor
-- =============================================

-- Add view permission columns
ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_view_quotes BOOLEAN DEFAULT true;
ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_view_invoices BOOLEAN DEFAULT true;
ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_view_customers BOOLEAN DEFAULT true;
ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_view_pipeline BOOLEAN DEFAULT true;

-- Update existing roles with sensible defaults
-- Admin gets everything
UPDATE app_roles SET 
  can_view_quotes = true,
  can_view_invoices = true,
  can_view_customers = true,
  can_view_pipeline = true
WHERE name = 'Admin';

-- Office Manager can view everything
UPDATE app_roles SET 
  can_view_quotes = true,
  can_view_invoices = true,
  can_view_customers = true,
  can_view_pipeline = true
WHERE name = 'Office Manager';

-- Shop Manager - pipeline only (adjust as needed)
UPDATE app_roles SET 
  can_view_quotes = false,
  can_view_invoices = false,
  can_view_customers = false,
  can_view_pipeline = true
WHERE name = 'Shop Manager';

-- Installer - pipeline only
UPDATE app_roles SET 
  can_view_quotes = false,
  can_view_invoices = false,
  can_view_customers = false,
  can_view_pipeline = true
WHERE name = 'Installer';
