ALTER TABLE articles ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS articles_tags_idx ON articles USING gin(tags);
