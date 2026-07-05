-- Long-form v2: content_stills table + content_clips/items extensions.
-- Companion: docs/longform-v2-image-first-plan.md

-- ── content_stills: one row per generated still/cut per scene ─────────────────
create table if not exists content_stills (
  id              bigserial primary key,
  project_id      bigint not null references content_items(id) on delete cascade,
  scene_n         integer not null,
  cut             char(1) not null check (cut in ('A','B','C','D')),
  act             smallint,                        -- 0=cold open 1-5=acts 6=outro
  prompt          text,                            -- null for reuse/editor rows
  motion          text not null default 'push'
    check (motion in ('push','micro_push','pull','smash','pan_lr','pan_rl','parallax','hold')),
  transition      text check (transition is null or transition in ('cut','dissolve','fade')),
  start_sec       numeric,                         -- cut start within parent scene
  end_sec         numeric,                         -- cut end within parent scene
  image_source    text not null default 'google'
    check (image_source in ('google','higgsfield','fal','cloudflare','reference','reuse','editor')),
  reuse_of        text,                            -- e.g. 'S07-B' — source still ID
  regrade         text check (regrade is null or regrade in ('warm_amber','cold_blue','none')),
  reference_keys  text[] not null default '{}',
  clip_url        text,
  status          text not null default 'pending'
    check (status in ('pending','generating','generated','validating','passed','failed','blocked')),
  retry_count     integer not null default 0,
  fail_reason     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, scene_n, cut)
);

create index if not exists idx_content_stills_project_status
  on content_stills (project_id, status);

create index if not exists idx_content_stills_project_scene
  on content_stills (project_id, scene_n);

drop trigger if exists trg_content_stills_updated_at on content_stills;
create trigger trg_content_stills_updated_at
  before update on content_stills
  for each row execute function set_updated_at();

-- ── content_clips: add overlays, sfx, editor_build kind ──────────────────────
alter table content_clips
  add column if not exists overlays jsonb,
  add column if not exists sfx jsonb;

alter table content_clips drop constraint if exists content_clips_kind_check;
alter table content_clips add constraint content_clips_kind_check
  check (kind in ('clip','still','text_card','editor_build'));

-- ── content_items: audio plan + new pipeline statuses ────────────────────────
alter table content_items
  add column if not exists audio_plan jsonb;

alter table content_items
  drop constraint if exists content_items_status_check;
alter table content_items
  add constraint content_items_status_check
  check (status in (
    'brief', 'storyboard', 'planning', 'scripting', 'awaiting_script_approval',
    'seeding', 'awaiting_refs', 'awaiting_stills', 'awaiting_final_approval',
    'generating', 'pending', 'rendering', 'rendered', 'publishing', 'posted',
    'failed', 'blocked'
  ));
