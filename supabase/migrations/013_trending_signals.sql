-- Stores trending signals from Google Trends + competitor Facebook pages.
-- Used for editorial awareness and future publish_score boosting.
CREATE TABLE IF NOT EXISTS trending_signals (
  id           bigserial PRIMARY KEY,
  country      text NOT NULL CHECK (country IN ('FR', 'IT')),
  signal_type  text NOT NULL CHECK (signal_type IN ('google_trends', 'fb_page')),
  query        text,                          -- Google Trends: search query / FB: page name
  source_page  text,                          -- FB: page slug; Trends: source publication
  title        text NOT NULL,
  snippet      text,
  url          text,
  engagement_total int DEFAULT 0,            -- FB posts only
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trending_signals_country_idx
  ON trending_signals (country, fetched_at DESC);

-- Auto-delete signals older than 7 days (they have no long-term value)
CREATE OR REPLACE FUNCTION delete_old_trending_signals() RETURNS void
  LANGUAGE sql AS $$
    DELETE FROM trending_signals WHERE fetched_at < now() - interval '7 days';
  $$;
