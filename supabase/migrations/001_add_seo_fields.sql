-- Run manually in Supabase SQL Editor before running any generation scripts.
-- Dashboard: https://supabase.com/dashboard/project/<your-project-ref>/sql/new
-- SUPABASE_SERVICE_ROLE_KEY is required for the Edge Function — never commit this key.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS seo_description TEXT;
