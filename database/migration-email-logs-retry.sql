-- Add retry/status tracking columns to email_logs
-- These columns have defaults so existing inserts continue to work unchanged

ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS email_type VARCHAR(50);

-- Index for the retry query: find failed emails that haven't exceeded max attempts
CREATE INDEX IF NOT EXISTS idx_email_logs_retry
  ON email_logs (status, attempt_count)
  WHERE status = 'failed' AND attempt_count < 3;
