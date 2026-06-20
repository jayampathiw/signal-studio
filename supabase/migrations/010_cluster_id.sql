ALTER TABLE articles ADD COLUMN IF NOT EXISTS cluster_id bigint;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS cluster_size int DEFAULT 1;
CREATE INDEX IF NOT EXISTS articles_cluster_idx ON articles (cluster_id);
