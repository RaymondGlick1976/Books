# Frank – Nightly Report (updated prompt: only Step 2 to-do line changed)

Only this bullet changes from the current prompt. Everything else stays the same.

Replace:
  - Also list collection "todos" for anything Raymond checked off today (done=true, doneAt today) and what's still open on Today.

With:
  - Also run these in the HCD database (Supabase project byozvlgtbwiohyrfvxii, execute_sql):
    SELECT title, done_at FROM public.todos WHERE is_done = true AND done_at >= <today midnight America/New_York, as UTC>;
    SELECT title FROM public.todos WHERE is_done = false AND bucket = 'today';
    These are the to-dos Raymond checked off today and what's still open on the Today page.
