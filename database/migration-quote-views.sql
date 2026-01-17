-- Quote Views Tracking Table
-- Run this migration to track when customers view quotes

-- Create quote_views table
CREATE TABLE IF NOT EXISTS quote_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(50),
  user_agent TEXT,
  source VARCHAR(20) DEFAULT 'public' -- 'public' (email link) or 'portal' (customer portal)
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_quote_views_quote_id ON quote_views(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_views_viewed_at ON quote_views(viewed_at DESC);

-- Add view_count to quotes table for quick access
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

-- Function to increment view count
CREATE OR REPLACE FUNCTION increment_quote_views(quote_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE quotes SET view_count = COALESCE(view_count, 0) + 1 WHERE id = quote_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE quote_views ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access
CREATE POLICY "Service role has full access to quote_views" ON quote_views
  FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON quote_views TO authenticated;
GRANT ALL ON quote_views TO service_role;
GRANT EXECUTE ON FUNCTION increment_quote_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_quote_views(UUID) TO service_role;
