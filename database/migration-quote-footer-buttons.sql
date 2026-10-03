-- Quote footer link buttons (Oct 2026)
-- Button definitions live in settings.quote_footer.buttons: [{id, label, url, default_on}]
-- Each quote stores which buttons it shows. NULL = use buttons marked default_on.
alter table public.quotes add column if not exists footer_button_ids jsonb;
