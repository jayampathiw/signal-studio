import type { ResolvedJob } from '@signal-studio/core/resolve';
import { Timeline, type ShotT, type TimelineT } from '@signal-studio/core/schemas';

/**
 * P2.1 — the `clips-overlay` template's `compile()`: `ResolvedJob → Timeline`
 * for one output variant (e.g. 'fb'/'ig'). Pure function, no I/O — the
 * `assets` (P2.3) and `tts` stages have already run by the time this is
 * called; their measured outputs (normalised clip path + duration, VO path +
 * duration) are supplied as `shotAssets`/`shotVoiceovers` rather than
 * re-derived here, the same "stage output feeds the next stage's input"
 * convention `packages/core/src/stages/assets.ts` already established.
 *
 * `contentId` isn't a manifest/project field (job identity is a DB/dispatch
 * concern — see `packages/templates/../../projects/assemblex-factory/packs/
 * blbl.v1.ts`'s header for the same reasoning about `post_id`), so the
 * caller supplies it directly rather than this function inventing one.
 */

export type ShotAssetT = {
  /** Local path to the shot's normalised clip (post `assets` stage). */
  clipPath: string;
  /** Measured duration of that normalised clip, seconds. */
  durationS: number;
};

export type ShotVoiceoverT = {
  /** Local path to the shot's synthesised, loudnorm'd narration. */
  path: string;
  /** Measured duration of that narration, seconds. */
  durationS: number;
};

export type CompileParams = {
  contentId: string;
  /** Which manifest output variant this Timeline instance renders. */
  outputId: string;
  shotAssets: Record<string, ShotAssetT>;
  shotVoiceovers: Record<string, ShotVoiceoverT>;
};

const END_CARD_DURATION_SECS = 1.5;

export class ClipsOverlayCompileError extends Error {}

function visibleShots(shots: ShotT[], outputId: string): ShotT[] {
  // Mirrors the pilot bridge's `visibleShots()` exactly: only the 'ig'
  // variant drops `ig_optional` shots — every other output keeps all of
  // them. Generalising further (e.g. a per-output allow-list) isn't
  // something any real manifest has asked for yet.
  return outputId === 'ig' ? shots.filter((s) => !s.ig_optional) : shots;
}

export function compile(resolvedJob: ResolvedJob, params: CompileParams): TimelineT {
  const { manifest } = resolvedJob;

  if (manifest.visual.mode !== 'clips-overlay') {
    throw new ClipsOverlayCompileError(
      `compile() is the clips-overlay template's compiler; got visual.mode="${manifest.visual.mode}"`,
    );
  }
  // `end_card` became schema-optional at P3.7 (`case-file` has no end-card
  // concept at all) — clips-overlay still requires one, checked here now
  // instead of at the schema level.
  if (!manifest.end_card) {
    throw new ClipsOverlayCompileError(
      'compile(): manifest.end_card is required for clips-overlay',
    );
  }

  const shots = visibleShots(manifest.shots, params.outputId);

  const scenes = shots.map((shot) => {
    const asset = params.shotAssets[shot.id];
    if (!asset) {
      throw new ClipsOverlayCompileError(
        `compile(): missing shotAssets["${shot.id}"] — clips-overlay requires every shot's normalised clip + measured duration from the assets stage`,
      );
    }
    if (!shot.overlay_text || shot.overlay_out_s === undefined) {
      throw new ClipsOverlayCompileError(
        `compile(): shot "${shot.id}" is missing overlay_text/overlay_out_s — required for clips-overlay (manifest.v1's Shot schema allows both optional for other templates, but this one needs both)`,
      );
    }

    const voiceover = params.shotVoiceovers[shot.id];
    // Screen-time duration: the normalised clip's own measured duration,
    // shortened/lengthened by the shot's playback speed — same formula as
    // the pilot bridge's `shotDurationInFrames()`.
    const durationSecs = asset.durationS / shot.speed;

    return {
      id: shot.id,
      durationSecs,
      source: { localPath: asset.clipPath, type: 'video' as const },
      trimInSec: shot.trim_in_s,
      playbackRate: shot.speed,
      sourceMuted: !shot.audio.keep_native_sfx,
      overlay: { text: shot.overlay_text, inSec: shot.overlay_in_s, outSec: shot.overlay_out_s },
      ...(voiceover ? { narrationPath: voiceover.path, voStartSec: shot.overlay_in_s } : {}),
    };
  });

  const music = manifest.audio.music.file
    ? {
        path: manifest.audio.music.file,
        // The pilot bridge had no fade-out (an Remotion <Audio loop> just
        // gets cut at composition end) — Timeline.music.fadeOutSecs has no
        // manifest.v1 equivalent to source from, so this is a new,
        // deliberately modest default rather than 0 (an abrupt cut would be
        // a regression from the pilot's felt-fine-in-practice loop+cut).
        fadeOutSecs: 1.5,
        duckUnderVoice: manifest.audio.music.duck,
        gainDb: manifest.audio.music.gain_db,
      }
    : undefined;

  const timeline: TimelineT = Timeline.parse({
    contentId: params.contentId,
    // clips-overlay is vertical-shorts only in every real use so far (the
    // pilot bridge never rendered a horizontal variant of it) — hardcoded
    // rather than threaded through from a manifest/project field that
    // doesn't exist yet.
    aspectRatio: '9:16',
    scenes,
    music,
    // The pilot's EndCard (subject + pageName + disclosure, 3 lines) has no
    // dedicated Timeline field; CtaOverlay's {line1, line2, position:'end'}
    // is the closest existing fit. `pageName` is dropped — same as the
    // adapter dropping `post_id`/`subject`, there's no project-level
    // display-name field to source it from yet.
    cta: {
      line1: manifest.end_card.subject,
      line2: manifest.end_card.disclosure,
      durationSecs: END_CARD_DURATION_SECS,
      position: 'end',
    },
    watermark: { text: manifest.watermark.text, position: 'top-left', opacity: 0.85 },
    template: 'clips-overlay',
    outputId: params.outputId,
  });

  return timeline;
}
