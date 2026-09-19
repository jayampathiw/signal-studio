import { Manifest, type ManifestT } from '@signal-studio/core/schemas';

import { Pack, type PackT } from './pack.schema.ts';

/**
 * P2.3 — BLBL ("Built Layer by Layer") pack adapter: `pack.json → manifest.v1`.
 * Pure function, no I/O — callers read/parse the pack.json themselves
 * (this only takes the already-validated `PackT`, not a file path), same
 * convention as `resolveJob()` taking a `ManifestT` rather than a path.
 *
 * `projectRef` isn't a `Pack` field (pack.json is pure content; which
 * project/org it belongs to is an operational concern, not something the
 * content author writes into every pack) — the caller supplies it.
 *
 * Fields with no home in `manifest.v1`, deliberately dropped rather than
 * guessed into a wrong slot:
 *   - `post_id`, `subject` — pack-level production metadata (this becomes
 *     a job's identity/description in the DB, not part of the render spec)
 *   - `mode` ('A'/'B'/'C') — a BLBL production-workflow concept (how much
 *     was manually vs. AI-authored), not a rendering input
 *   - `compilation_target_s` — only meaningful to the `compilation`
 *     template (P2.2), not `clips-overlay`; this adapter is for the latter
 *   - Shot-level `duration_s`/`voiceover_file`/`voiceover_duration_s` — the
 *     pilot's `prep`/`tts` scripts wrote these back into pack.json in place;
 *     in the engine these are the `assets`/`tts` stages' *output* artifacts,
 *     not part of the input manifest a shot is described by
 */
export function packToManifest(pack: PackT, opts: { projectRef: string }): ManifestT {
  const raw = {
    version: '1' as const,
    projectRef: opts.projectRef,
    template: 'clips-overlay',
    shots: pack.shots.map((shot) => ({
      id: shot.id,
      clip: shot.clip_file,
      trim_in_s: shot.trim_in_s,
      speed: shot.speed,
      overlay_text: shot.overlay_text,
      overlay_in_s: shot.overlay_in_s,
      overlay_out_s: shot.overlay_out_s,
      voiceover_text: shot.voiceover_text,
      ig_optional: shot.ig_optional,
      audio: shot.audio,
      fact_confidence: shot.fact_confidence,
      verify: shot.verify,
    })),
    visual: { mode: 'clips-overlay' },
    audio: {
      voice: pack.audio.voice_id,
      speed: pack.audio.voice_speed,
      music: {
        file: pack.music.file,
        mood: pack.music.mood,
        gain_db: pack.music.gain_db,
        duck: pack.music.duck,
      },
    },
    end_card: pack.end_card,
    watermark: pack.watermark,
    outputs: pack.outputs,
    captions: pack.captions,
    disclosure: pack.disclosure,
  };

  return Manifest.parse(raw);
}

// Re-exported for callers that want to validate a raw pack.json before
// adapting it (mirrors how `Manifest.safeParse` is used elsewhere).
export { Pack };
export type { PackT };
