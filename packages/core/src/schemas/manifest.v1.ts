import { z } from 'zod';

/**
 * The engine's job manifest — the generalized, template-agnostic version of
 * what the AssembleX pilot bridge's Pack schema (projects/assemblex-factory/
 * pilot/src/manifest.ts) proved out for one template. Field list per
 * refactor-plan.md §10 P1.1; where the plan lists a field without pinning
 * its exact shape (e.g. `script{shots[]} / shots[]`, `visual{mode}`,
 * `gates[]`, `publish[]`), the shape below is this file's own decision,
 * flagged here rather than guessed at silently:
 *   - shots live at the top level (`shots[]`), not nested under `script` —
 *     the "/" in the plan reads as noting two possible spots, not both existing;
 *     top-level matches the pilot's proven Pack shape.
 *   - `gates[]` is a list of gate names (strings) a job must pass before
 *     `awaiting_review:<gate>` clears — the actual gate *logic* lives in
 *     packages/providers, this only names which ones apply.
 *   - `publish[]` is a list of platform target strings (e.g. 'facebook',
 *     'instagram'), resolved against `project.v1.ts`'s `publishTargets[]`
 *     for credentials — this only says *which* targets, not how.
 */

export const FactConfidence = z.enum(['high', 'medium', 'low']);

export const ShotAudio = z.object({
  strip_native_audio: z.boolean().default(false),
  keep_native_sfx: z.boolean().default(true),
});

export const Shot = z.object({
  id: z.string().min(1),
  // Exactly one visual source per shot: a video clip, a still image, or a
  // pure text/narration-only shot (no source) — generalizes the pilot's
  // clip-only `clip_file` so non-video templates (stills-kenburns, etc.)
  // can reuse the same shot shape.
  text: z.string().optional(),
  image: z.string().optional(),
  clip: z.string().optional(),
  trim_in_s: z.number().min(0).default(0),
  speed: z.number().min(0.25).max(4).default(1.0),
  overlay_text: z.string().min(1).max(120).optional(),
  overlay_in_s: z.number().min(0).default(0.4),
  overlay_out_s: z.number().min(0).optional(),
  voiceover_text: z.string().min(1).optional(),
  ig_optional: z.boolean().default(false),
  audio: ShotAudio.default({ strip_native_audio: false, keep_native_sfx: true }),
  fact_confidence: FactConfidence.optional(),
  verify: z.string().optional(),
});

export const ManifestAudio = z.object({
  voice: z.string().default('bm_george'),
  speed: z.number().min(0.5).max(2).default(1.0),
  music: z
    .object({
      file: z.string().optional(),
      mood: z.string().optional(),
      gain_db: z.number().default(-18),
      duck: z.boolean().default(true),
    })
    .default({ gain_db: -18, duck: true }),
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

export const InputJob = z.object({
  kind: z.string(),
  ref: z.string(),
});

export const Visual = z.object({
  // Which render strategy the job uses (e.g. 'clips-overlay',
  // 'stills-kenburns', 'shorts-916', 'case-file', 'carousel' — one per
  // packages/templates/* per the plan's Phase 2/3 template list).
  mode: z.string(),
});

export const Manifest = z
  .object({
    version: z.literal('1'),
    projectRef: z.string().min(1),
    template: z.string().min(1),
    inputs: z
      .object({
        jobs: z.array(InputJob).default([]),
      })
      .default({ jobs: [] }),
    shots: z.array(Shot).min(1).max(6),
    visual: Visual,
    audio: ManifestAudio.default({
      voice: 'bm_george',
      speed: 1.0,
      music: { gain_db: -18, duck: true },
    }),
    end_card: EndCard,
    watermark: Watermark.default({ text: 'AI visualisation' }),
    outputs: z.array(z.string()).min(1),
    captions: Captions,
    disclosure: z.boolean().default(true),
    gates: z.array(z.string()).default([]),
    publish: z.array(z.string()).default([]),
    // P2.2 addition: a soft duration target for the `compilation` template
    // only (the pilot bridge's `Pack.compilation_target_s`, ported up from
    // per-episode-pack to manifest.v1 since a compilation manifest is its
    // own job, not one of the episodes being compiled). Optional and
    // unenforced by this schema — `compile()` warns rather than fails when
    // the compiled scenes exceed it, same as the pilot's own
    // render-compilation.ts did.
    compilationTargetS: z.number().positive().optional(),
  })
  .superRefine((manifest, ctx) => {
    // clips-overlay is the only template that requires every shot to carry
    // an actual video clip — other visual modes (stills-kenburns, etc.)
    // legitimately use image/text-only shots.
    if (manifest.visual.mode !== 'clips-overlay') return;
    manifest.shots.forEach((shot, i) => {
      if (!shot.clip) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shots', i, 'clip'],
          message: 'clip is required for every shot when visual.mode is "clips-overlay"',
        });
      }
    });
  });

export type ShotT = z.infer<typeof Shot>;
export type ManifestT = z.infer<typeof Manifest>;
