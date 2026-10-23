-- Today page: to-do list shared by the CRM page and crew agents.
-- Applied to HCD Books (byozvlgtbwiohyrfvxii) as migration todos_table.
CREATE TABLE IF NOT EXISTS public.todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  notes TEXT,
  bucket TEXT NOT NULL DEFAULT 'today' CHECK (bucket IN ('today', 'week', 'later')),
  job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  owner TEXT,
  due_date DATE,
  is_done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_todos_bucket_done ON public.todos (bucket, is_done);
CREATE INDEX IF NOT EXISTS idx_todos_job ON public.todos (job_id);

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_full_access ON public.todos
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
