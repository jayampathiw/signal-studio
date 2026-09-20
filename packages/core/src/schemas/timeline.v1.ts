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
});

export type TimelineT = z.infer<typeof Timeline>;
export type TimelineSceneT = z.infer<typeof TimelineScene>;
