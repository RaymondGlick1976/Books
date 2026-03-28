-- Fix: Remove the auto-convert to 'converted' from the quote acceptance trigger.
-- The trigger was automatically setting quotes to 'converted' when they became 'accepted',
-- which prevented the admin from using the "→ Invoice" button (which requires 'accepted' status).
-- Converting to invoice should be a separate manual step.

CREATE OR REPLACE FUNCTION create_job_from_quote()
RETURNS TRIGGER AS $$
DECLARE
  new_job_number VARCHAR;
  quote_record RECORD;
  customer_record RECORD;
BEGIN
  -- Only trigger when status changes to 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    -- Get quote details
    SELECT * INTO quote_record FROM quotes WHERE id = NEW.id;
    SELECT * INTO customer_record FROM customers WHERE id = quote_record.customer_id;

    -- Generate job number
    new_job_number := generate_job_number();

    -- Create the job (only if one doesn't already exist for this quote)
    IF NOT EXISTS (SELECT 1 FROM jobs WHERE quote_id = NEW.id) THEN
      INSERT INTO jobs (
        job_number,
        name,
        customer_id,
        quote_id,
        stage,
        estimated_value,
        notes
      ) VALUES (
        new_job_number,
        quote_record.title,
        quote_record.customer_id,
        quote_record.id,
        'job-sold',
        quote_record.total,
        'Created from quote ' || quote_record.quote_number
      );
    END IF;

    -- Do NOT auto-convert status. Let admin manually convert via "→ Invoice" button.
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
