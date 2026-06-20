ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_signals jsonb DEFAULT '{}'::jsonb;
