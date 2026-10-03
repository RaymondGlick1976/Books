-- =============================================
-- EMAIL SEQUENCES - automated, scheduled emails per deal stage
-- Run this in Supabase SQL Editor (safe to re-run)
--
-- How it works:
--   * Each deal stage can have one sequence (email_sequences) with any number
--     of emails (sequence_steps). Emails are built from blocks (JSON).
--   * When a deal (jobs row) enters a stage, trigger trg_jobs_enroll_sequence
--     cancels anything still pending for that deal and queues the new stage's
--     emails in scheduled_emails with exact send times (America/New_York).
--   * Netlify function send-sequence-emails runs every 15 minutes and sends
--     whatever is due.
--   * Customers who unsubscribe get customers.disable_drips = true.
-- =============================================

-- ---------- Tables ----------

CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id VARCHAR(50) NOT NULL UNIQUE REFERENCES job_stages(stage_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  -- Optional: after the last email, move the deal to another stage
  advance_to_stage VARCHAR(50) REFERENCES job_stages(stage_id) ON DELETE SET NULL,
  advance_after_days INTEGER NOT NULL DEFAULT 1 CHECK (advance_after_days >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL DEFAULT 0,
  name VARCHAR(255),
  subject VARCHAR(500) NOT NULL DEFAULT '',
  preheader VARCHAR(255),
  style VARCHAR(20) NOT NULL DEFAULT 'branded' CHECK (style IN ('branded', 'plain')),
  blocks JSONB NOT NULL DEFAULT '[]',
  -- Timing, relative to the moment the deal entered the stage
  delay_days INTEGER NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  delay_hours INTEGER NOT NULL DEFAULT 0 CHECK (delay_hours >= 0),
  send_time TIME,                       -- NULL = send right after the delay
  weekdays_only BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sequence_steps_sequence ON sequence_steps(sequence_id, step_order);

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (kind IN ('email', 'advance')),
  sequence_id UUID REFERENCES email_sequences(id) ON DELETE SET NULL,
  step_id UUID REFERENCES sequence_steps(id) ON DELETE SET NULL,
  deal_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  stage_id VARCHAR(50) NOT NULL,        -- stage the deal must still be in
  advance_to_stage VARCHAR(50),         -- for kind = 'advance'
  send_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'cancelled', 'failed', 'skipped')),
  status_reason TEXT,
  sent_at TIMESTAMPTZ,
  email_log_id UUID REFERENCES email_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_due ON scheduled_emails(send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_deal ON scheduled_emails(deal_id);

-- Per-deal kill switch: when true, the deal gets no sequence emails or auto stage moves
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS automations_off BOOLEAN NOT NULL DEFAULT false;

-- Unsubscribe token per customer (disable_drips already exists and is the opt-out flag)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();
UPDATE customers SET unsubscribe_token = gen_random_uuid() WHERE unsubscribe_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unsubscribe_token ON customers(unsubscribe_token);

-- ---------- RLS (same pattern as the rest of the app) ----------

ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_full_access ON email_sequences;
CREATE POLICY authenticated_full_access ON email_sequences FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON sequence_steps;
CREATE POLICY authenticated_full_access ON sequence_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_full_access ON scheduled_emails;
CREATE POLICY authenticated_full_access ON scheduled_emails FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- Send-time calculation ----------
-- Day N at a set time is measured in Eastern time from the day the deal
-- entered the stage. If that moment has already passed (e.g. "Day 0 at 9:30am"
-- but the deal moved at 3pm), it rolls to the next day. Weekend sends roll to Monday.

CREATE OR REPLACE FUNCTION compute_sequence_send_at(
  p_base TIMESTAMPTZ, p_delay_days INT, p_delay_hours INT, p_send_time TIME, p_weekdays_only BOOLEAN
) RETURNS TIMESTAMPTZ
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  tz CONSTANT TEXT := 'America/New_York';
  v_at TIMESTAMPTZ;
  v_local_date DATE;
BEGIN
  IF p_send_time IS NULL THEN
    v_at := p_base + make_interval(days => p_delay_days, hours => p_delay_hours);
  ELSE
    v_local_date := ((p_base + make_interval(hours => p_delay_hours)) AT TIME ZONE tz)::date + p_delay_days;
    v_at := (v_local_date + p_send_time) AT TIME ZONE tz;
    IF v_at < p_base THEN
      v_at := ((v_local_date + 1) + p_send_time) AT TIME ZONE tz;
    END IF;
  END IF;

  IF p_weekdays_only THEN
    WHILE EXTRACT(ISODOW FROM (v_at AT TIME ZONE tz)) IN (6, 7) LOOP
      v_at := (((v_at AT TIME ZONE tz) + INTERVAL '1 day')) AT TIME ZONE tz;
    END LOOP;
  END IF;

  RETURN v_at;
END;
$$;

-- ---------- Enroll a deal in its current stage's sequence ----------

CREATE OR REPLACE FUNCTION enroll_deal_in_sequence(p_deal_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deal RECORD;
  v_seq RECORD;
  v_step RECORD;
  v_send_at TIMESTAMPTZ;
  v_last TIMESTAMPTZ;
  v_count INT := 0;
BEGIN
  -- Anything still waiting for this deal no longer applies
  UPDATE scheduled_emails
     SET status = 'cancelled', status_reason = 'Deal changed stage'
   WHERE deal_id = p_deal_id AND status = 'pending';

  SELECT j.id, j.stage, j.customer_id, j.automations_off, c.email, COALESCE(c.disable_drips, false) AS disable_drips
    INTO v_deal
    FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id
   WHERE j.id = p_deal_id;

  IF NOT FOUND OR v_deal.stage IS NULL OR v_deal.automations_off THEN RETURN 0; END IF;

  SELECT * INTO v_seq FROM email_sequences WHERE stage_id = v_deal.stage AND is_active;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Emails need a reachable, subscribed customer; stage auto-advance does not
  IF v_deal.email IS NOT NULL AND v_deal.email <> '' AND NOT v_deal.disable_drips THEN
    FOR v_step IN
      SELECT * FROM sequence_steps
       WHERE sequence_id = v_seq.id AND is_active
       ORDER BY step_order, created_at
    LOOP
      v_send_at := compute_sequence_send_at(NOW(), v_step.delay_days, v_step.delay_hours, v_step.send_time, v_step.weekdays_only);
      INSERT INTO scheduled_emails (kind, sequence_id, step_id, deal_id, customer_id, stage_id, send_at)
      VALUES ('email', v_seq.id, v_step.id, v_deal.id, v_deal.customer_id, v_deal.stage, v_send_at);
      v_last := GREATEST(COALESCE(v_last, v_send_at), v_send_at);
      v_count := v_count + 1;
    END LOOP;
  END IF;

  IF v_seq.advance_to_stage IS NOT NULL AND v_seq.advance_to_stage <> v_deal.stage THEN
    INSERT INTO scheduled_emails (kind, sequence_id, deal_id, customer_id, stage_id, advance_to_stage, send_at)
    VALUES ('advance', v_seq.id, v_deal.id, v_deal.customer_id, v_deal.stage, v_seq.advance_to_stage,
            COALESCE(v_last, NOW()) + make_interval(days => v_seq.advance_after_days));
  END IF;

  RETURN v_count;
END;
$$;

-- ---------- Trigger: deal created or moved to a new stage ----------

CREATE OR REPLACE FUNCTION trg_jobs_enroll_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Automations switched off: cancel anything waiting for this deal
  IF TG_OP = 'UPDATE' AND NEW.automations_off AND NOT OLD.automations_off THEN
    UPDATE scheduled_emails SET status = 'cancelled', status_reason = 'Automations turned off for this deal'
     WHERE deal_id = NEW.id AND status = 'pending';
  END IF;

  -- New deal or stage change (automations_off is checked inside enroll)
  IF TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage THEN
    BEGIN
      PERFORM enroll_deal_in_sequence(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Never block a stage change because of email scheduling
      RAISE WARNING 'enroll_deal_in_sequence failed for deal %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_enroll_sequence ON jobs;
CREATE TRIGGER trg_jobs_enroll_sequence
  AFTER INSERT OR UPDATE OF stage, automations_off ON jobs
  FOR EACH ROW EXECUTE FUNCTION trg_jobs_enroll_sequence();

-- ---------- Cleanup: deleting/disabling a step cancels its pending sends ----------

CREATE OR REPLACE FUNCTION trg_sequence_steps_cancel_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE scheduled_emails SET status = 'cancelled', status_reason = 'Email removed from sequence'
     WHERE step_id = OLD.id AND status = 'pending';
    RETURN OLD;
  END IF;
  IF NEW.is_active = false AND OLD.is_active = true THEN
    UPDATE scheduled_emails SET status = 'cancelled', status_reason = 'Email turned off'
     WHERE step_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sequence_steps_cancel_pending ON sequence_steps;
CREATE TRIGGER trg_sequence_steps_cancel_pending
  BEFORE DELETE OR UPDATE OF is_active ON sequence_steps
  FOR EACH ROW EXECUTE FUNCTION trg_sequence_steps_cancel_pending();

-- Turning a whole sequence off cancels everything pending for it
CREATE OR REPLACE FUNCTION trg_email_sequences_cancel_pending()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    UPDATE scheduled_emails SET status = 'cancelled', status_reason = 'Sequence turned off'
     WHERE sequence_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_sequences_cancel_pending ON email_sequences;
CREATE TRIGGER trg_email_sequences_cancel_pending
  AFTER UPDATE OF is_active ON email_sequences
  FOR EACH ROW EXECUTE FUNCTION trg_email_sequences_cancel_pending();

-- Unsubscribing cancels everything pending for that customer
CREATE OR REPLACE FUNCTION trg_customers_cancel_drips()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.disable_drips = true AND COALESCE(OLD.disable_drips, false) = false THEN
    UPDATE scheduled_emails SET status = 'cancelled', status_reason = 'Customer opted out'
     WHERE customer_id = NEW.id AND status = 'pending' AND kind = 'email';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_cancel_drips ON customers;
CREATE TRIGGER trg_customers_cancel_drips
  AFTER UPDATE OF disable_drips ON customers
  FOR EACH ROW EXECUTE FUNCTION trg_customers_cancel_drips();

-- Only the app's logged-in users / service role may enroll deals manually
REVOKE ALL ON FUNCTION enroll_deal_in_sequence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION enroll_deal_in_sequence(UUID) TO authenticated, service_role;
