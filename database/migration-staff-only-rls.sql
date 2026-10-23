-- =============================================================
-- STAFF-ONLY RLS — DRAFT FOR REVIEW (not applied)
-- Replaces "any signed-in user gets everything" with an email allowlist.
-- Effect:
--   * Only emails in staff_emails can read/write business tables via the anon key + session.
--   * Anon behaviour unchanged (settings reads, visualizer lead insert, stain images).
--   * Netlify functions use the service role and bypass RLS, so they are unaffected.
-- To add staff later: insert into staff_emails. Keep the list short.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.staff_emails (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.staff_emails ENABLE ROW LEVEL SECURITY;   -- no policies: only service role reads it
INSERT INTO public.staff_emails (email) VALUES ('raymond@homesteadcabinetdesign.com')
ON CONFLICT (email) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_emails
    WHERE lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- 1) Swap the open policy for staff-only on every table that has it
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'authenticated_full_access'
  LOOP
    EXECUTE format('DROP POLICY authenticated_full_access ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY staff_full_access ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
      r.tablename);
  END LOOP;
END $$;

-- 2) Read-only staff policies that used "true" for any signed-in user
DROP POLICY IF EXISTS "staff read lisa chats" ON public.lisa_chats;
CREATE POLICY "staff read lisa chats" ON public.lisa_chats
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "staff read website leads" ON public.website_leads;
CREATE POLICY "staff read website leads" ON public.website_leads
  FOR SELECT TO authenticated USING (public.is_staff());

-- 3) Tables with RLS but no policies (knowledge_base, lisa_*, visualizer_usage, ...) stay
--    service-role only. Nothing to change.

-- 4) Storage: the Uploads bucket policies from rls-lockdown.sql are unchanged here.
--    Review them separately before tightening.

-- ROLLBACK (restores the old open policy for authenticated users):
-- DO $$ DECLARE r record; BEGIN
--   FOR r IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='staff_full_access' LOOP
--     EXECUTE format('DROP POLICY staff_full_access ON public.%I', r.tablename);
--     EXECUTE format('CREATE POLICY authenticated_full_access ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', r.tablename);
--   END LOOP;
-- END $$;
