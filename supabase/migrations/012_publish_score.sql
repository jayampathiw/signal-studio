ALTER TABLE articles ADD COLUMN IF NOT EXISTS publish_score numeric;
CREATE INDEX IF NOT EXISTS articles_publish_score_idx ON articles (publish_score DESC) WHERE status = 'approved';
