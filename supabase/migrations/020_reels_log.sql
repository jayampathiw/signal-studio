-- niche_config: one row per content niche.
-- dedup_days controls how long a topic_hash is considered a duplicate for that niche.
-- channels is reference metadata (which pages use this niche).
-- Any pipeline can read this table to get its dedup window.
CREATE TABLE IF NOT EXISTS niche_config (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche      text UNIQUE NOT NULL,
  dedup_days integer NOT NULL DEFAULT 7,
  channels   text[] NOT NULL DEFAULT '{}',
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION touch_niche_config()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE OR REPLACE TRIGGER niche_config_updated
  BEFORE UPDATE ON niche_config
  FOR EACH ROW EXECUTE FUNCTION touch_niche_config();

-- Seed initial niches
INSERT INTO niche_config (niche, dedup_days, channels) VALUES
  ('news',      7,  ARRAY['France Aujourd''hui', 'Italia Oggi', 'Vivere in Italia']),
  ('nature',    30, ARRAY['NaturePlus', 'Natuframe']),
  ('sport',     3,  ARRAY['France Aujourd''hui', 'Italia Oggi']),
  ('lifestyle', 14, ARRAY[]::text[]),
  ('culture',   14, ARRAY[]::text[])
ON CONFLICT (niche) DO NOTHING;

-- reels_log: one row per successfully generated reel, across all pipelines and channels.
-- topic_hash is a 16-char hex SHA-256 fingerprint of the normalised title.
-- Dedup query: WHERE topic_hash = $1 AND channel = $2 AND created_at > now() - dedup_days * interval '1 day'
CREATE TABLE IF NOT EXISTS reels_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_hash  text NOT NULL,
  topic_title text,
  channel     text NOT NULL,
  niche       text NOT NULL DEFAULT 'news',
  country     text,
  platform    text NOT NULL DEFAULT 'facebook',
  source_id   uuid,
  reel_path   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast dedup lookup (channel + hash + time range)
CREATE INDEX IF NOT EXISTS reels_log_dedup_idx    ON reels_log (topic_hash, channel, created_at DESC);
-- Channel timeline (dashboard / reporting queries)
CREATE INDEX IF NOT EXISTS reels_log_channel_idx  ON reels_log (channel, created_at DESC);
-- Niche reporting
CREATE INDEX IF NOT EXISTS reels_log_niche_idx    ON reels_log (niche, created_at DESC);
