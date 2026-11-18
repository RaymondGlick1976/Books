-- Onsite estimates are saved as quotes with quote_type = 'onsite' (internal only, no email templates).
-- onsite_data holds the customer snapshot, the estimator answers and the priced lines.
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS onsite_data jsonb;
CREATE INDEX IF NOT EXISTS quotes_quote_type_idx ON public.quotes (quote_type);

-- quote_type must allow 'onsite' (the original check only allowed ballpark and final)
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_quote_type_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_quote_type_check CHECK (quote_type::text = ANY (ARRAY['ballpark'::character varying, 'final'::character varying, 'onsite'::character varying]::text[]));
