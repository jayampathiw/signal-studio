-- 20260627_channel_configs.sql
-- Editable per-channel ("page") generation defaults.
--
-- Precedence at generation time (resolved by the wild-eye-reel skill):
--   reel content_items.gen_config  →  channel_configs.config  →  channels.js (code)
--
-- `config` jsonb mirrors the GenConfig shape used by the dashboard Config tab:
--   { imageModel, videoModel, imageRes, videoRes, aspectRatio, duration,
--     generateAudio }
-- Any key absent from the row falls through to the channels.js code default,
-- so a sparse row (e.g. just { "videoModel": "kling3_0" }) overrides only that
-- one value channel-wide.
--
-- No RLS — mirrors content_items, which the dashboard writes with the anon key.
-- Explicit grants make the table writable regardless of default-privilege config.

create table if not exists channel_configs (
  channel_key text primary key,
  config      jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

grant all on channel_configs to anon, authenticated, service_role;
