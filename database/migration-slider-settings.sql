-- Migration: Add slider_settings to quotes table
-- Run this in your Supabase SQL Editor

-- Add slider_settings JSONB column to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS slider_settings JSONB;

-- Comment explaining the structure
COMMENT ON COLUMN quotes.slider_settings IS 'Before/after slider settings: {enabled, title, subtitle, before_image, before_label, before_desc, after_image, after_label, after_desc}';
