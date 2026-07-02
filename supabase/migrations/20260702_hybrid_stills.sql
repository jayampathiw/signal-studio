alter table content_clips drop constraint if exists content_clips_kind_check;
alter table content_clips add constraint content_clips_kind_check
  check (kind in ('clip','still','text_card'));

alter table content_clips add column if not exists image_source text
  check (image_source is null
         or image_source in ('reference','higgsfield','fal','cloudflare','google'));
