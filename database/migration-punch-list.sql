-- Punch List Items table
-- Run this migration before deploying the punch list feature

CREATE TABLE punch_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_punch_list_job ON punch_list_items(job_id);
CREATE INDEX idx_punch_list_completed ON punch_list_items(is_completed);

-- Enable RLS
ALTER TABLE punch_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON punch_list_items
  FOR ALL USING (auth.role() = 'authenticated');
