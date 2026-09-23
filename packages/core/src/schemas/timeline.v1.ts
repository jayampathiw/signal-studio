import { z } from 'zod';

/**
 * Engine-agnostic render timeline — the contract between the stage runner
 * and packages/render/* — ported from packages/types/timeline.js's JSDoc
 * typedefs to zod, plus the fields P1.1 calls for that the JS version never
 * had: playbackRate, overlay{text,inSec,outSec}, voStartSec,
 * music.duckUnderVoice, watermark.text, outputId (which output variant —
 * e.g. 'fb'/'ig' — this timeline instance renders).
 */

export const CaptionWord = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
});

export const HighlightBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  fromSec: z.number(),
  toSec: z.number(),
  opacity: z.number().min(0).max(1).default(0.55),
});

export const ZoomRegion = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

export const CaseMeta = z.object({
  caseId: z.string(),
  sourceCitation: z.string().optional(),
  specimen: z.boolean().optional(),
});

export const MusicTrack = z.object({
  path: z.string(),
  fadeOutSecs: z.number(),
  // Ducks under any active narration window, per the same ramped-gain
  // behavior the pilot bridge's Post/Compilation compositions implement.
  duckUnderVoice: z.boolean().default(true),
  // P2.1 addition: the pilot bridge's manifest-level music.gain_db had no
  // home here until clips-overlay (the first real Timeline consumer) needed
  // it to reproduce the pilot's mix. -18 matches both the pilot's and
  // manifest.v1's ManifestAudio.music default.
  gainDb: z.number().default(-18),
});

export const CtaOverlay = z.object({
  line1: z.string(),
  line2: z.string(),
  durationSecs: z.number(),
  position: z.enum(['end', 'throughout']),
});

export const Watermark = z.object({
  path: z.string().optional(),
  // Text watermark, as an alternative/addition to an image path (e.g. the
  // pilot bridge's plain "AI visualisation" text watermark).
  text: z.string().optional(),
  // 'top-left' added in P2.1 — the pilot bridge's Watermark.tsx always
  // rendered there; the other two positions predate any real caller.
  position: z.enum(['bottom-right', 'bottom-left', 'top-left']),
  opacity: z.number().min(0).max(1),
});

export const TimelineOverlay = z.object({
  text: z.string(),
  inSec: z.number(),
  outSec: z.number(),
});

// P3.1 additions — the `stills-kenburns` template's own scene shape: a
// scene there is 1+ still-image "cuts" (each its own Ken Burns motion,
// optional colour grade, and crop position) concatenated together, not one
// `source`. Field names/values mirror `apps/video/src/longform/{motion,
// render}.js`'s existing shapes closely (camelCased) — this is a port, not
// a redesign; every motion/regrade/transition value below is one this
// engine's filter-building code already implements.
export const KenBurnsCut = z.object({
  imagePath: z.string(),
  motion: z
    .enum(['push', 'micro_push', 'pull', 'smash', 'pan_lr', 'pan_rl', 'parallax', 'hold', 'static'])
    .default('push'),
  regrade: z.enum(['warm_amber', 'cold_blue']).optional(),
  // 0..1 horizontal crop-window offset (0.5 = center) — for a portrait crop
  // out of an off-center source image.
  cropX: z.number().min(0).max(1).default(0.5),
  transition: z.enum(['cut', 'dissolve']).default('cut'),
  durationSecs: z.number().positive(),
});

// A tier-2 caption-chunk word, timed relative to the overlay's own atSec
// (not absolute) — see motion.js's buildCaptionAccent for why.
export const KenBurnsCaptionWord = z.object({
  text: z.string(),
  offsetStartSec: z.number(),
  offsetEndSec: z.number(),
});

// Discriminated on `format`: 'tiered' is the hero-card (tier 1) / running-
// caption (tier 2) system; 'legacy' is the older single-drawtext shape
// (`style` one of small_cream/lower_third/stamp). Both are real, both still
// render through motion.js's `buildDrawtext` today.
export const KenBurnsOverlay = z.object({
  format: z.enum(['tiered', 'legacy']),
  tier: z.union([z.literal(1), z.literal(2)]).optional(),
  text: z.string().optional(),
  amberWord: z.string().optional(),
  zone: z.string().optional(),
  atSec: z.number().optional(),
  durationSec: z.number().optional(),
  words: z.array(KenBurnsCaptionWord).optional(),
  style: z.enum(['small_cream', 'lower_third', 'stamp']).optional(),
  // Tier-1 hero-card overrides — an explicit pixel `y` (rather than the
  // zone-derived default) and a fade-in override. P3.2 addition: needed for
  // `shorts-916`'s multi-line wrapped hook overlays, where each wrapped
  // line is its own tier-1 overlay at its own explicit y — motion.ts's
  // `buildHeroCard` already supported both (see its own `TieredHeroOverlay`
  // type), this schema just never exposed them until now.
  y: z.string().optional(),
  fadeIn: z.number().optional(),
});

// One-shot SFX cue, absolute-seconds within its scene (already resolved
// from the shotlist's 🔊 free-text cue via map-audio-cues.ts at compile
// time — the render engine never re-interprets raw cue text).
export const KenBurnsSfxCue = z.object({
  key: z.string(),
  atSec: z.number().default(0),
  holdSec: z.number().optional(),
});

// The `stills-kenburns` music-bed schedule — the top-level counterpart to
// the old per-project `audio-plan.json`. `track` is an audio-kit manifest
// key, or the literals 'hum_only' (ambience-only, no distinct bed) /
// 'silence' (a hard gap).
export const KenBurnsMusicSegment = z.object({
  fromSec: z.number(),
  toSec: z.number(),
  track: z.string(),
  gainDb: z.number().default(-23),
});

// P3.2 addition — `shorts-916`'s two-line navy end card (v2 spec: title
// larger/cream, platform-neutral CTA smaller/amber). Kept as its own
// distinct field rather than folded into the existing `title` `sceneType` /
// `captionText`/`bgImagePath` text-card shape those already cover — a
// title-card scene is single-line white-on-black, this is two independently
// sized/colored lines on a fixed navy background, and forcing it through the
// same fields would mean overloading `captionText` with an implicit
// title+subtitle split syntax nothing else needs.
export const EndCardV2 = z.object({
  title: z.string(),
  subtitle: z.string(),
});

// P3.2 addition — one layer of `shorts-916`'s scene-aware layered sound
// design (hum/bed/heartbeat/hit), already resolved to absolute timeline
// seconds by `compile()` (see that package's own header for why — the
// original `assemble-short-rewrite.mjs` computed these against each scene's
// ACTUAL rendered duration, which `compile()` now bakes into every scene's
// `durationSecs` up front, the same architectural shift P3.1 made for
// VO-reconciliation). `kind: 'oneshot'` layers (the musical hit) have no
// `endSec` — they're a single one-shot audio file placed at `startSec`, not
// a looped bed with a window.
export const SoundDesignLayer = z.object({
  kind: z.enum(['loop', 'oneshot']),
  key: z.string(),
  startSec: z.number(),
  endSec: z.number().optional(),
  gainDb: z.number(),
  fadeInSec: z.number().optional(),
  fadeOutSec: z.number().optional(),
});

export const SoundDesign = z.object({
  layers: z.array(SoundDesignLayer),
});

export const TimelineScene = z.object({
  id: z.string(),
  durationSecs: z.number().positive(),
  source: z
    .object({
      localPath: z.string(),
      type: z.enum(['image', 'video']),
    })
    .optional(),
  narrationPath: z.string().optional(),
  subtitleSrtPath: z.string().optional(),
  captionText: z.string().optional(),
  highlight: HighlightBox.optional(),
  highlights: z.array(HighlightBox).optional(),
  zoomFrom: ZoomRegion.optional(),
  zoomTo: ZoomRegion.optional(),
  visual: z.record(z.string(), z.unknown()).optional(),
  waveformOverlay: z.boolean().optional(),
  words: z.array(CaptionWord).optional(),
  // Playback speed multiplier applied to the source clip (1 = normal speed).
  playbackRate: z.number().positive().default(1),
  // On-screen text overlay window, scene-relative seconds — distinct from
  // captionText/words (spoken-word captions); this is a standalone graphic.
  overlay: TimelineOverlay.optional(),
  // When narration starts, scene-relative seconds (mirrors the pilot's
  // overlay_in_s-driven VO start).
  voStartSec: z.number().optional(),
  // P2.1 additions, discovered necessary building the first real template
  // (clips-overlay) against this schema:
  // How far into `source`'s own file to start playback (seconds) — the
  // `assets` stage normalises a clip's scale/fps/codec but doesn't trim it,
  // so a per-shot in-point still has to travel through to render time.
  trimInSec: z.number().min(0).default(0),
  // Mute `source`'s own audio track (e.g. a shot whose manifest Shot sets
  // audio.strip_native_audio) — distinct from narrationPath, which is
  // always audible.
  sourceMuted: z.boolean().default(false),
  // P2.2 addition: the `compilation` template injects text-only title-plate
  // scenes (no `source`) between episodes, flattened into the same `scenes`
  // array rather than adding a separate nested "episodes" concept to this
  // schema — 'title' is exactly those synthetic scenes; every real shot
  // (from clips-overlay or any other per-episode template) is 'shot'.
  sceneType: z.enum(['shot', 'title']).default('shot'),
  // P3.1 additions — see the schemas' own header comments just above. All
  // optional/absent for every existing template (clips-overlay,
  // compilation); only `stills-kenburns`'s `render-ffmpeg` engine reads
  // them. `cuts` present means "this is a multi-still Ken Burns scene, not
  // a single `source`"; absent (title cards, and every other template)
  // means the existing `source`/`captionText`-driven rendering applies
  // unchanged.
  cuts: z.array(KenBurnsCut).optional(),
  kenBurnsOverlays: z.array(KenBurnsOverlay).optional(),
  sfx: z.array(KenBurnsSfxCue).optional(),
  // A still-image background for an otherwise-blank text-card scene (e.g. a
  // title card with its own baked-in graphic) — distinct from `cuts`
  // (an animated Ken Burns scene) and from `source` (used by other
  // templates' own scene shape).
  bgImagePath: z.string().optional(),
  // P3.2 addition — see EndCardV2's own header comment. Present only on
  // `shorts-916` end-card scenes; mutually exclusive with `cuts`/`source` in
  // practice (the render engine checks `cuts` first, so this only takes
  // effect on scenes with no `cuts`).
  endCard: EndCardV2.optional(),
});

export const Timeline = z.object({
  contentId: z.string(),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']),
  scenes: z.array(TimelineScene),
  music: MusicTrack.optional(),
  cta: CtaOverlay.optional(),
  watermark: Watermark.optional(),
  template: z.string().default('news-card'),
  caseMeta: CaseMeta.optional(),
  // Which manifest output variant (e.g. 'fb', 'ig') this timeline instance
  // was resolved for, when a manifest declares more than one.
  outputId: z.string().optional(),
  // P3.1 addition — `stills-kenburns`'s music-bed schedule; see
  // KenBurnsMusicSegment's own header comment.
  musicPlan: z.array(KenBurnsMusicSegment).optional(),
  // P3.2 addition — `shorts-916`'s layered sound design; see SoundDesign's
  // own header comment. Mutually exclusive with `musicPlan` in practice
  // (different templates use different mixing paths in `render-ffmpeg`).
  soundDesign: SoundDesign.optional(),
});

export type TimelineT = z.infer<typeof Timeline>;
export type TimelineSceneT = z.infer<typeof TimelineScene>;
export type KenBurnsCutT = z.infer<typeof KenBurnsCut>;
export type KenBurnsOverlayT = z.infer<typeof KenBurnsOverlay>;
export type KenBurnsMusicSegmentT = z.infer<typeof KenBurnsMusicSegment>;
export type SoundDesignLayerT = z.infer<typeof SoundDesignLayer>;
export type EndCardV2T = z.infer<typeof EndCardV2>;
