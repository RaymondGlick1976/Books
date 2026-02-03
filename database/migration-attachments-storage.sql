-- Migration: Quote Attachments Storage Setup
-- Run this in Supabase SQL Editor

-- 1. Create the 'uploads' storage bucket if it doesn't exist
-- Go to Supabase Dashboard → Storage → Create Bucket
-- Name: uploads
-- Public: YES (so file URLs are accessible)
-- File size limit: 10MB

-- 2. Storage RLS Policies for the 'uploads' bucket
-- Allow authenticated users (admin) to upload files
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT 'Admin upload', 'uploads', 'INSERT', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'Admin upload' AND bucket_id = 'uploads'
);

-- Allow public read access to uploaded files
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT 'Public read', 'uploads', 'SELECT', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'Public read' AND bucket_id = 'uploads'
);

-- Allow authenticated users to delete files
INSERT INTO storage.policies (name, bucket_id, operation, definition)
SELECT 'Admin delete', 'uploads', 'DELETE', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM storage.policies WHERE name = 'Admin delete' AND bucket_id = 'uploads'
);

-- NOTE: If the above SQL doesn't work for storage policies,
-- set them up manually in Supabase Dashboard → Storage → uploads → Policies:
--   - INSERT: Allow for authenticated users
--   - SELECT: Allow for all (public)
--   - DELETE: Allow for authenticated users

-- 3. Ensure quote_attachments table RLS allows admin access
-- (These should already exist from schema.sql, but just in case)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'quote_attachments' AND policyname = 'Admin full access to quote_attachments'
  ) THEN
    CREATE POLICY "Admin full access to quote_attachments" ON quote_attachments FOR ALL USING (true);
  END IF;
END $$;
