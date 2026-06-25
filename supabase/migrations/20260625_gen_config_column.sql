-- 104_gen_config.sql
-- Adds a per-reel generation config jsonb column for content_items.
-- Written by the dashboard Config tab; read by the wild-eye-reel skill,
-- which falls back to channel defaults (channels.js) when null.
--
-- Shape: { imageModel, videoModel, imageRes, videoRes, aspectRatio, duration }
-- e.g. { "imageModel": "nano_banana_pro", "videoModel": "seedance_2_0",
--        "imageRes": "2k", "videoRes": "720p", "aspectRatio": "9:16" }

alter table content_items
  add column if not exists gen_config jsonb;
