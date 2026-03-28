-- Add qb_payment_id column to payments table for QuickBooks sync tracking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS qb_payment_id VARCHAR;
