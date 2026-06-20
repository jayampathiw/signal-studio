-- article_id assumes articles.id is uuid (Supabase default).
-- If your articles table uses bigint PKs, change uuid → bigint below.
CREATE TABLE post_metrics (
  id             bigserial    PRIMARY KEY,
  article_id     uuid         NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  fb_post_id     text         NOT NULL,
  snapshot_at    timestamptz  NOT NULL DEFAULT now(),
  interval_tag   text         NOT NULL CHECK (interval_tag IN ('+1h', '+24h', '+7d')),
  impressions    int,
  engaged_users  int,
  reactions_total int,
  reactions_like  int,
  reactions_love  int,
  reactions_anger int,
  reactions_haha  int,
  reactions_wow   int,
  reactions_sad   int,
  comments       int,
  shares         int,
  clicks         int,
  raw_response   jsonb,
  UNIQUE (article_id, interval_tag)
);

CREATE INDEX post_metrics_article_idx  ON post_metrics (article_id);
CREATE INDEX post_metrics_snapshot_idx ON post_metrics (snapshot_at);
