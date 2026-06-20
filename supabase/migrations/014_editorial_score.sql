ALTER TABLE articles ADD COLUMN IF NOT EXISTS editorial_score numeric;

CREATE INDEX IF NOT EXISTS articles_editorial_score_idx
  ON articles (country, editorial_score DESC NULLS LAST);
