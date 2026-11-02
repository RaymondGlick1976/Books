-- =============================================
-- QUOTE ACTION PERMISSIONS - Migration
-- Run this in Supabase SQL Editor
-- Splits "Accept" and "Convert to Invoice" out of Edit Quotes.
-- =============================================

ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_accept_quotes  BOOLEAN DEFAULT true;
ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_convert_quotes BOOLEAN DEFAULT true;

-- Roles that couldn't edit quotes shouldn't accept/convert them either
UPDATE app_roles SET can_accept_quotes = false, can_convert_quotes = false
WHERE can_edit_quotes = false;

-- Estimator: can build and edit quotes, but not accept, convert, or delete
UPDATE app_roles SET can_accept_quotes = false, can_convert_quotes = false, can_delete = false
WHERE name = 'Estimator';
