ALTER TABLE articles ADD COLUMN IF NOT EXISTS boost_eligible boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS articles_boost_eligible_idx ON articles (boost_eligible);
