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

// P3.7 addition — `case-file`'s own free-form fraction-box overlay
// geometry (`packages/core/src/schemas/timeline.v1.ts`'s `HighlightBox`/
// `ZoomRegion`, duplicated here rather than imported: `manifest.v1` is the
// job's *input* shape, `timeline.v1` is the *compiled* IR, and this repo
// keeps those two schema files independent on purpose — nothing else in
// `manifest.v1.ts` imports from `timeline.v1.ts`).
export const ShotHighlight = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  fromSec: z.number().optional(),
  toSec: z.number().optional(),
  fromFraction: z.number().min(0).max(1).optional(),
  toFraction: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
});

export const ShotZoomRegion = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
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
  // P3.7 additions — `case-file`-only fields (real job wiring, generalizing
  // `run-job.ts` beyond `clips-overlay`). Optional/unused by every other
  // template, same "additive per template" convention `end_card`/
  // `compilationTargetS` already established.
  highlight: ShotHighlight.optional(),
  highlights: z.array(ShotHighlight).optional(),
  zoomFrom: ShotZoomRegion.optional(),
  zoomTo: ShotZoomRegion.optional(),
  holdExtraSecs: z.number().optional(),
  waveformOverlay: z.boolean().optional(),
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
    // P3.5 addition — the plan's own `publish-youtube` bullet needs a real
    // description body, and manifest.v1 only ever had a title field for
    // YouTube; `youtube_shorts_title` alone left the `publish` stage no
    // honest way to build a description without guessing between the
    // Facebook/Instagram caption bodies (which are written for different
    // platforms' tone/length).
    youtube_description: z.string().optional(),
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

// P3.7 addition — `case-file`'s own top-level config (real job wiring),
// distinct from `end_card` (a `clips-overlay`/`shorts-916` concept this
// template doesn't use at all). `aspectRatio` here, not per-outputId: the
// two real Policy File cases this template was verified against
// (`mamboleo-pacific-life-settlement` 16:9, `...-reel` 9:16) are two
// *separate* jobs/projects, not two outputs of the same job the way
// `clips-overlay`'s `fb`/`ig` are — so this job's whole render (every
// `outputs[]` entry) shares one aspect ratio, set once here.
export const CaseFileConfig = z.object({
  caseId: z.string().min(1),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  sourceCitation: z.string().optional(),
  hideSourceOnScreen: z.boolean().default(false),
  specimen: z.boolean().default(false),
  showOutro: z.boolean().default(true),
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
    // P3.7 relaxation — was `.max(6)` unconditionally, a `clips-overlay`
    // pilot-content-sized guard with no documented reason to apply to
    // every template. Real content for the other templates has far more
    // scenes (the real `mamboleo-pacific-life-settlement` 16:9 case has 16
    // scenes) — moved the max-6 rule into `superRefine` below, scoped to
    // `clips-overlay` only, so this test's own existing behavior for that
    // template is unchanged.
    shots: z.array(Shot).min(1),
    visual: Visual,
    audio: ManifestAudio.default({
      voice: 'bm_george',
      speed: 1.0,
      music: { gain_db: -18, duck: true },
    }),
    // P3.7 relaxation — was required unconditionally; `case-file` has no
    // end-card concept at all (see `CaseFileConfig`'s own header).
    end_card: EndCard.optional(),
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
    case_file: CaseFileConfig.optional(),
  })
  .superRefine((manifest, ctx) => {
    // clips-overlay is the only template that requires every shot to carry
    // an actual video clip — other visual modes (stills-kenburns, etc.)
    // legitimately use image/text-only shots. Its shot-count cap (6) is
    // also scoped here, not schema-wide — see the `shots` field's own
    // comment for why.
    if (manifest.visual.mode !== 'clips-overlay') return;
    if (manifest.shots.length > 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shots'],
        message: 'clips-overlay supports at most 6 shots',
      });
    }
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
