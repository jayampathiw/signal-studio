import { z } from 'zod';

/**
 * Copy of `projects/assemblex-factory/pilot/src/manifest.ts`'s `Pack` schema
 * (P0.8-02), duplicated here rather than imported from `pilot/`.
 *
 * Why a copy, not a shared import: the pilot bridge is explicitly retired at
 * P2's T-P gate (`docs/refactor/refactor-plan.md` §10 — "Retire the pilot
 * bridge: delete projects/assemblex-factory/pilot/"), but `pack.json` is
 * BLBL's own authored input format, not the pilot's — it needs to keep
 * working (via this adapter) after the pilot's throwaway plumbing is gone.
 * A file that will still be read after `pilot/` is deleted can't import from
 * `pilot/`.
 *
 * Same reconstruction caveat as the original: the source "Built Layer by
 * Layer" Implementation Plan §2 was unavailable, so this schema was
 * reconstructed from field references across the plan's §10. Any correction
 * to the pilot's copy should be mirrored here until the pilot is retired and
 * this becomes the single copy.
 */

export const FactConfidence = z.enum(['high', 'medium', 'low']);

export const ShotAudio = z.object({
  strip_native_audio: z.boolean().default(false),
  keep_native_sfx: z.boolean().default(true),
});

export const Shot = z.object({
  id: z.string().min(1),
  clip_file: z.string().min(1),
  trim_in_s: z.number().min(0).default(0),
  speed: z.number().min(0.25).max(4).default(1.0),
  overlay_text: z.string().min(1).max(120),
  overlay_in_s: z.number().min(0).default(0.4),
  overlay_out_s: z.number().min(0),
  voiceover_text: z.string().min(1),
  ig_optional: z.boolean().default(false),
  audio: ShotAudio.default({ strip_native_audio: false, keep_native_sfx: true }),
  fact_confidence: FactConfidence,
  verify: z.string().min(1),
  duration_s: z.number().positive().optional(),
  voiceover_file: z.string().optional(),
  voiceover_duration_s: z.number().positive().optional(),
});

export const PackAudio = z.object({
  voice_id: z.string().default('bm_george'),
  voice_speed: z.number().min(0.5).max(2).default(1.0),
});

export const PackMusic = z.object({
  file: z.string().optional(),
  mood: z.string().optional(),
  gain_db: z.number().default(-18),
  duck: z.boolean().default(true),
});

export const EndCard = z.object({
  subject: z.string().min(1),
  disclosure: z.string().min(1),
});

export const Watermark = z.object({
  text: z.string().default('AI visualisation'),
});

export const Captions = z
  .object({
    facebook: z.string().optional(),
    facebook_question: z.string().optional(),
    instagram: z.string().optional(),
    youtube_shorts_title: z.string().optional(),
    hashtags_facebook: z.array(z.string()).default([]),
    hashtags_instagram: z.array(z.string()).default([]),
  })
  .default({});

export const Output = z.enum(['fb', 'ig']);

export const Pack = z.object({
  post_id: z.string().min(1),
  mode: z.enum(['A', 'B', 'C']).default('C'),
  subject: z.string().min(1),
  fact_confidence: FactConfidence,
  verify: z.string().min(1),
  audio: PackAudio.default({ voice_id: 'bm_george', voice_speed: 1.0 }),
  music: PackMusic.default({ gain_db: -18, duck: true }),
  end_card: EndCard,
  watermark: Watermark.default({ text: 'AI visualisation' }),
  outputs: z.array(Output).min(1),
  shots: z.array(Shot).min(1).max(6),
  captions: Captions,
  disclosure: z.boolean().default(true),
  compilation_target_s: z.number().positive().optional(),
});

export type ShotT = z.infer<typeof Shot>;
export type PackT = z.infer<typeof Pack>;
