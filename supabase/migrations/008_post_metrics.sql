-- article_id assumes articles.id is uuid (Supabase default).
-- If your articles table uses bigint PKs, change uuid → bigint below.
create table if not exists post_metrics (
  id              bigserial    primary key,
  article_id      uuid         not null references articles(id) on delete cascade,
  fb_post_id      text         not null,
  snapshot_at     timestamptz  not null default now(),
  interval_tag    text         not null check (interval_tag in ('+1h', '+24h', '+7d')),
  impressions     int,
  engaged_users   int,
  reactions_total int,
  reactions_like  int,
  reactions_love  int,
  reactions_anger int,
  reactions_haha  int,
  reactions_wow   int,
  reactions_sad   int,
  comments        int,
  shares          int,
  clicks          int,
  raw_response    jsonb,
  created_at      timestamptz not null default now(),
  unique (article_id, interval_tag)
);

create index if not exists post_metrics_article_idx on post_metrics (article_id);
create index if not exists post_metrics_snapshot_idx on post_metrics (snapshot_at);
create index if not exists post_metrics_interval_idx on post_metrics (interval_tag);
