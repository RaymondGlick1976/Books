-- Migration: Add archived status to quotes and invoices
-- Run this in Supabase SQL Editor

-- Update quotes status constraint to include 'archived'
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check 
  CHECK (status IN ('draft', 'pending', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted', 'archived'));

-- Update invoices status constraint to include 'archived'  
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check 
  CHECK (status IN ('draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled', 'archived'));
