-- Reels pipeline schema. Lives alongside the news pipeline's `articles` table
-- in the same Supabase project. The two pipelines do not share rows.

create table if not exists content_items (
  id            bigserial primary key,
  channel_key   text not null,                 -- e.g. 'wildlife/factual/EN'
  niche         text not null,                 -- 'wildlife', 'fitness', …
  style         text not null,                 -- 'factual' | 'cinematic' | 'listicle' | 'silent'
  language      text not null,                 -- 'en', 'fr', …

  -- Source provenance
  source_type   text not null,                 -- 'pexels' | 'pixabay' | 'archive_org' | 'ai_video' | 'manual'
  source_clips  jsonb not null default '[]',   -- [{url, durationSec, license, attribution, sourceId}]
  source_query  text,                          -- the search query that surfaced these clips

  -- AI-generated content
  title              text,
  description        text,
  narration_script   text,                     -- voice-over text (null for silent mode)
  ai_caption         jsonb,                    -- {intro, question, cta}
  hashtags           text[] default '{}',

  -- Render output
  rendered_video_url text,                     -- R2 URL of final MP4
  rendered_local_path text,                    -- temporary, for debugging
  rendered_at        timestamptz,
  duration_sec       numeric,
  thumbnail_url      text,

  -- Overall lifecycle
  status text not null default 'pending'
    check (status in ('pending', 'rendering', 'rendered', 'publishing', 'posted', 'failed', 'blocked')),

  -- Target platforms (declared by channel config, copied here for filtering)
  target_platforms text[] not null default '{}',

  -- Per-platform publication status (denormalized — at 4 platforms this is simpler than a join table)
  fb_status      text, fb_post_id   text, fb_posted_at   timestamptz, fb_error   text,
  ig_status      text, ig_post_id   text, ig_posted_at   timestamptz, ig_error   text,
  yt_status      text, yt_video_id  text, yt_posted_at   timestamptz, yt_error   text,
  tt_status      text, tt_video_id  text, tt_posted_at   timestamptz, tt_error   text,

  -- Bookkeeping
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_content_items_channel on content_items (channel_key);
create index if not exists idx_content_items_niche   on content_items (niche);
create index if not exists idx_content_items_style   on content_items (style);
create index if not exists idx_content_items_status  on content_items (status);
create index if not exists idx_content_items_created on content_items (created_at desc);

-- Auto-update updated_at on row change
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_content_items_updated_at on content_items;
create trigger trg_content_items_updated_at
  before update on content_items
  for each row execute function set_updated_at();
