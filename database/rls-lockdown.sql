-- =============================================================
-- RLS LOCKDOWN — July 2026
-- Locks every public table to the `authenticated` role.
-- The anon (public) key keeps only:
--   * SELECT on 4 non-sensitive settings keys (branding/company/terms/quote_footer)
--   * INSERT into visualizer_leads (stain visualizer on marketing site)
--   * SELECT on stain_visualizer_images
--   * read/upload on the `visualizer` storage bucket, read on `Uploads`
-- All Netlify functions use SUPABASE_SERVICE_ROLE_KEY, which bypasses
-- RLS, so booking form / scheduling / portal / emails are unaffected.
--
-- IMPORTANT: apply ONLY AFTER deploying the app changes that add
-- Supabase Auth to /admin/login.html — the admin UI queries tables
-- directly with the anon key + auth session, and locks out otherwise.
-- =============================================================

-- 1) Drop every existing policy on public tables (they were all allow-all)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2) Enable RLS everywhere + full access for authenticated users
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('CREATE POLICY authenticated_full_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', r.tablename);
  END LOOP;
END $$;

-- 3) Narrow anon exceptions (public-facing reads/inserts that bypass functions)
CREATE POLICY anon_read_safe_settings ON public.settings
  FOR SELECT TO anon
  USING (key IN ('branding','company','terms_and_conditions','quote_footer'));

CREATE POLICY anon_insert_visualizer_leads ON public.visualizer_leads
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY anon_read_stain_visualizer_images ON public.stain_visualizer_images
  FOR SELECT TO anon USING (true);

-- 4) Views must respect the caller's RLS (not the view owner's privileges)
ALTER VIEW public.job_pipeline_summary SET (security_invoker = true);
ALTER VIEW public.jobs_with_details SET (security_invoker = true);

-- 5) Storage: only authenticated users may write/delete in Uploads
--    (public read stays — upload URLs are shared in quotes/emails;
--     visualizer bucket policies for anon stay as-is)
DROP POLICY IF EXISTS "Allow all uploads ns5jle_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete ns5jle_0" ON storage.objects;
CREATE POLICY authenticated_insert_uploads ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'Uploads');
CREATE POLICY authenticated_update_uploads ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'Uploads');
CREATE POLICY authenticated_delete_uploads ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'Uploads');
