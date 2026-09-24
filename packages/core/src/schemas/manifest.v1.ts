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

// P3.7 addition — `stills-kenburns`'s own top-level config. Its real input
// format is a whole `shotlist-v2.md` text blob (scene/cut/motion/overlay
// language none of `manifest.v1`'s `shots[]` fields represent), not a flat
// shot list — so unlike `case-file`, this template doesn't reuse `shots[]`
// at all. `stillImages` maps each cut's own shot id (this file's own
// convention: `S{scene_n zero-padded}-{cut letter}`, e.g. "S01-A") to the
// filename it was uploaded under (`ss upload --shot S01-A --file <path>`)
// — needed because, unlike `clips-overlay`'s `shot.clip`/`case-file`'s
// `shot.image`, nothing in a parsed shotlist names an actual uploaded
// filename for run-job.ts to look for.
export const StillsKenburnsConfig = z.object({
  shotlistText: z.string().min(1),
  stillImages: z.record(z.string(), z.string()),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
});

// P3.7 addition — `shorts-916`'s own top-level config, mirroring
// `packages/templates/shorts-916/src/compile.ts`'s own `ShortsConfig`/
// `ShortsSceneConfig`/`ShortsSoundDesignConfig` types exactly (this schema
// is the manifest-input mirror of that compile-time type, same relationship
// `CaseFileConfig`/`StillsKenburnsConfig` already have to their templates).
// Like `stills-kenburns`, this template doesn't reuse `shots[]` at all —
// its scenes carry their own bespoke shape (hook text, sound-design layer
// config, end-card-v2 fields) `shots[]` has no room for. `images` maps each
// scene's own image/image2 *key* (this file's convention: `S{scene number
// zero-padded}-{A|B}`, e.g. "S01-A") to the filename it was uploaded under —
// same convention `StillsKenburnsConfig.stillImages` already established,
// reused here rather than invented fresh. A scene's `image`/`image2` string
// in `scenes[]` below is expected to BE one of these keys, not a real path —
// `run-job.ts`'s handler resolves it; `compile()` never touches storage.
export const Shorts916SoundDesignConfig = z.object({
  hum: z.object({ key: z.string().min(1), gain_db: z.number().optional() }).optional(),
  bed: z
    .object({
      key: z.string().min(1),
      gain_db: z.number().optional(),
      start_scene: z.number().int().positive(),
      end_scene: z.number().int().positive().nullable().optional(),
      fade_in_sec: z.number().optional(),
      resume_gain_db: z.number().optional(),
      resume_fade_in_sec: z.number().optional(),
    })
    .optional(),
  heartbeat: z
    .object({
      key: z.string().min(1),
      gain_db: z.number().optional(),
      start_scene: z.number().int().positive(),
      start_offset_sec: z.number().optional(),
      end_scene: z.number().int().positive(),
      fade_in_sec: z.number().optional(),
    })
    .optional(),
  hit: z.object({ key: z.string().min(1), gain_db: z.number().optional() }).optional(),
});

export const Shorts916SceneConfig = z.object({
  image: z.string().optional(),
  image2: z.string().optional(),
  motion: z.string().optional(),
  motion2: z.string().optional(),
  regrade: z.enum(['warm_amber', 'cold_blue']).nullable().optional(),
  regrade2: z.enum(['warm_amber', 'cold_blue']).nullable().optional(),
  crop_x: z.number().min(0).max(1).optional(),
  crop_x2: z.number().min(0).max(1).optional(),
  vo: z.string().optional(),
  vo_parts: z.array(z.string()).optional(),
  pause_sec: z.number().positive().optional(),
  target_duration_sec: z.number().positive(),
  hook: z.object({ amber_word: z.string().optional() }).optional(),
  end_card_v2: z.boolean().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  hit_on_start: z.boolean().optional(),
});

export const Shorts916Config = z.object({
  output: z.string().min(1),
  voice: z.string().optional(),
  images: z.record(z.string(), z.string()).default({}),
  scenes: z.array(Shorts916SceneConfig).min(1),
  sound_design: Shorts916SoundDesignConfig.optional(),
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
    // template is unchanged. Also relaxed from `.min(1)`: `stills-kenburns`
    // doesn't use `shots[]` at all (its own `StillsKenburnsConfig.
    // shotlistText` carries the scenes instead) — the min-1 rule moved into
    // `superRefine` too, scoped to every *other* template.
    shots: z.array(Shot).default([]),
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
    stillsKenburns: StillsKenburnsConfig.optional(),
    shorts916: Shorts916Config.optional(),
  })
  .superRefine((manifest, ctx) => {
    // `stills-kenburns`/`shorts-916` carry their scenes in their own
    // top-level config block instead of `shots[]` — every other template
    // still needs at least one shot (the `shots[].min(1)` rule moved here,
    // see that field's comment).
    const usesOwnSceneShape =
      manifest.visual.mode === 'stills-kenburns' || manifest.visual.mode === 'shorts-916';
    if (!usesOwnSceneShape && manifest.shots.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shots'],
        message:
          'at least one shot is required (except for visual.mode "stills-kenburns"/"shorts-916")',
      });
    }
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
