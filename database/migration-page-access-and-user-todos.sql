-- =============================================
-- PAGE ACCESS TOGGLES + PER-USER TO-DOS - Migration
-- Run this in Supabase SQL Editor BEFORE deploying the code change
-- =============================================

-- 1. Role toggles for the Print Sheets and Custom Library pages (default ON)
ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_view_print_sheets BOOLEAN DEFAULT true;
ALTER TABLE app_roles ADD COLUMN IF NOT EXISTS can_view_catalog      BOOLEAN DEFAULT true;

-- Custom Library used to follow "View Quotes"; keep roles that couldn't see it locked out
UPDATE app_roles SET can_view_catalog = false
WHERE can_view_quotes IS NOT TRUE;

-- 2. To-dos belong to the user who added them.
-- NULL = unassigned (existing to-dos and ones added by automations);
-- those show only for users whose role has "Manage Users".
ALTER TABLE todos ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
