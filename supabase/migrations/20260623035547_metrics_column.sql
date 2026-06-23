-- 103_metrics.sql
-- Adds a dedicated metrics jsonb column for post-performance data.
-- Written by tracker.mjs / /log-reel; read by the performance-analyst agent.
--
-- Shape: { logged_at, views, watch_through_pct, follows_gained,
--          distribution ('organic'|'boosted'|'mixed'),
--          fb_distribution_multiplier (optional) }

alter table content_items
  add column if not exists metrics jsonb;

create index if not exists idx_content_items_metrics
  on content_items (id) where metrics is not null;
