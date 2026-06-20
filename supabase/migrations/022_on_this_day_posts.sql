CREATE TABLE IF NOT EXISTS on_this_day_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country     text NOT NULL,
  post_date   date NOT NULL,
  title       text NOT NULL,
  events      jsonb NOT NULL DEFAULT '[]',
  ai_caption  jsonb,
  hashtags    text[] DEFAULT '{}',
  status      text NOT NULL DEFAULT 'pending',
  fb_post_id  text,
  posted_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS on_this_day_posts_country_date
  ON on_this_day_posts (country, post_date);

CREATE INDEX IF NOT EXISTS on_this_day_posts_status
  ON on_this_day_posts (status);
