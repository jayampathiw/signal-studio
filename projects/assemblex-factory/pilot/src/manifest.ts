import { z } from 'zod';

/**
 * Shot/Pack schema for the AssembleX pilot bridge (P0.8).
 *
 * NOTE: the plan (refactor-plan.md §10, P0.8-02) says this should follow the
 * "Built Layer by Layer" Implementation Plan §2 exactly. Those source docs were
 * not available in this repo or session, so this schema is reconstructed from
 * every field referenced across §10 (P0.8-01..08, P1.1, P2.1, P2.3) plus the
 * placeholder pack.json. Treat field names/defaults here as the working spec
 * until reconciled against the original docs — note any correction in this
 * file's history, not silently.
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

  // Written back by the `prep` stage (P0.8-03) — absent until then.
  duration_s: z.number().positive().optional(),

  // Written back by the `tts` stage (P0.8-04) — absent until then.
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
