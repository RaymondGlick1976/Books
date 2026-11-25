-- Multi-day appointments (e.g. a project that runs Monday-Friday).
-- NULL means a single-day appointment, so existing rows are unaffected.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_end_date date;
