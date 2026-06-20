ALTER TABLE articles ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'news';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS historical_topic_id TEXT;
CREATE INDEX IF NOT EXISTS articles_source_type_idx ON articles (source_type);
CREATE INDEX IF NOT EXISTS articles_historical_topic_idx ON articles (historical_topic_id) WHERE historical_topic_id IS NOT NULL;
