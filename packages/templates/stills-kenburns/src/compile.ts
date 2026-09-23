import type {
  KenBurnsCutT as KenBurnsCut,
  KenBurnsOverlayT as KenBurnsOverlay,
  TimelineSceneT,
  TimelineT,
} from '@signal-studio/core/schemas';
import { mapAudioCue } from '@signal-studio/render-ffmpeg/map-audio-cues';

import type { ParsedScene, ParsedShotlist } from './parsers/parse-shotlist-v2.ts';
import { tcToSec } from './parsers/parse-shotlist-v2.ts';

/**
 * P3.1 — the `stills-kenburns` template's `compile()`:
 * `parseShotlistV2()`'s output + resolved real assets → `Timeline`. Pure
 * function, no I/O — same "stage output feeds compile()'s params" pattern
 * `clips-overlay`/`compilation`'s own `compile()`s already established.
 *
 * **Deliberate architectural shift from the pre-P3.1
 * `assemble-local.mjs`**: that script did asset-discovery, VO-length
 * reconciliation, auto-cut-split, and rendering all interleaved in one
 * imperative loop. This `compile()` does everything *except* rendering —
 * it still performs the VO-reconciliation/auto-split *math* (it has to:
 * final per-cut `durationSecs` must be baked into the Timeline before
 * `render-ffmpeg`'s declarative engine ever runs — see `stills-render.ts`'s
 * own header), but the actual ffmpeg calls move to the render step.
 *
 * **Project quirks → manifest fields, per this phase's own plan bullet**:
 * `assemble-local.mjs` hardcoded two per-project override tables
 * (`NO_CAPTION_SCENES_BY_PROJECT`, `CUT_SPLIT_OVERRIDES_BY_PROJECT`),
 * keyed by directory name. Generalised here into `params.noCaptionScenes`
 * and `params.cutSplitOverrides` — the caller (a project's own
 * `project.yaml`/manifest, eventually) supplies them instead of this
 * template hardcoding project names.
 */

export type CaptionWordChunk = {
  at_sec: number;
  duration_sec: number;
  words: Array<{ text: string; offset_start: number; offset_end: number }>;
};

export type StillsKenburnsCompileParams = {
  contentId: string;
  aspectRatio?: '16:9' | '9:16';
  parsed: ParsedShotlist;
  // Resolves a scene/cut to its real still-image path on disk, or null if
  // missing (the caller already ran its own asset-discovery/download step).
  findStillPath: (sceneN: number, cut: string) => string | null;
  findVoPath: (sceneN: number) => string | null;
  // Real, already-measured VO duration in seconds (e.g. via ffprobe) —
  // compile() needs this for the VO-length reconciliation math but doesn't
  // measure it itself (no I/O in this function).
  voDurationSec: (sceneN: number) => number;
  // Real Whisper word-timestamp caption chunks, keyed "S{01}" — already
  // run through captions.ts's chunkCaptions() by the caller.
  sceneCaptions?: Record<string, CaptionWordChunk[]>;
  noCaptionScenes?: Set<number>;
  cutSplitOverrides?: Record<number, number[]>;
  enableAutoCutSplit?: boolean;
  maxSilentTail?: number | null;
  watermarkPath?: string;
  watermarkOpacity?: number;
  musicPlan?: Array<{ fromSec: number; toSec: number; track: string; gainDb?: number }>;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Ported unchanged from render.js's computeAutoSplitDurations — see that
// file's own header for why a dumb equal-time split routinely lands a cut
// boundary mid-sentence, and why snapping to real caption-chunk edges fixes
// it.
function computeAutoSplitDurations(
  sceneDur: number,
  numStills: number,
  chunks: CaptionWordChunk[] | null,
): number[] {
  const equalSlice = sceneDur / numStills;
  if (!chunks?.length || numStills < 2) {
    return Array(numStills).fill(equalSlice);
  }

  const candidates: number[] = [];
  for (const c of chunks) {
    candidates.push(c.at_sec);
    candidates.push(c.at_sec + c.duration_sec);
  }
  candidates.sort((a, b) => a - b);

  const minCutDur = Math.min(1.5, equalSlice * 0.4);
  const maxDrift = equalSlice * 0.6;
  const boundaries: number[] = [];
  let prev = 0;
  for (let k = 1; k < numStills; k++) {
    const target = equalSlice * k;
    let best = target;
    let bestDist = Infinity;
    for (const c of candidates) {
      if (c <= prev + minCutDur || c >= sceneDur - minCutDur * (numStills - k)) continue;
      const d = Math.abs(c - target);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (bestDist > maxDrift) best = target;
    boundaries.push(Math.max(prev + minCutDur, Number(best.toFixed(3))));
    prev = boundaries[boundaries.length - 1];
  }

  const edges = [0, ...boundaries, sceneDur];
  return edges.slice(1).map((end, i) => end - edges[i]);
}

function mapGrade(grade: string | null): 'warm_amber' | 'cold_blue' | undefined {
  if (grade === 'WARM' || grade === 'MOURNFUL') return 'warm_amber';
  if (grade === 'COLD' || grade === 'MONOCHROME') return 'cold_blue';
  return undefined;
}

function mergeCaptionOverlays(
  scene: ParsedScene,
  fromSec: number,
  params: StillsKenburnsCompileParams,
): KenBurnsOverlay[] {
  if (params.noCaptionScenes?.has(scene.scene_n)) return [];
  const chunks = params.sceneCaptions?.[`S${pad2(scene.scene_n)}`];
  if (!chunks?.length) return [];

  return chunks.map((c) => ({
    format: 'tiered' as const,
    tier: 2 as const,
    atSec: fromSec + c.at_sec,
    durationSec: c.duration_sec,
    words: c.words.map((w) => ({
      text: w.text,
      offsetStartSec: w.offset_start,
      offsetEndSec: w.offset_end,
    })),
  }));
}

export class StillsKenburnsCompileError extends Error {}

export function compile(params: StillsKenburnsCompileParams): TimelineT {
  const scenes: TimelineSceneT[] = [];

  for (const scene of params.parsed.scenes) {
    const n = pad2(scene.scene_n);
    const label = `S${n}`;

    // A scene with zero stills is a true text/title card — see
    // assemble-local.mjs's own comment for why the "EDITOR GRAPHIC"/
    // "EDITOR BUILD" kind flag alone isn't a reliable signal.
    if (!scene.stills?.length) {
      const cardText = scene.overlays?.find((o) => o.tier === 1)?.text ?? '';
      const bgImagePath = params.findStillPath(scene.scene_n, 'A') ?? undefined;
      scenes.push({
        id: label,
        durationSecs: scene.duration_sec,
        sceneType: 'title',
        captionText: cardText,
        bgImagePath,
        playbackRate: 1,
        trimInSec: 0,
        sourceMuted: false,
      });
      continue;
    }

    const splitPoints = params.cutSplitOverrides?.[scene.scene_n] ?? null;
    const stillRows = scene.stills
      .map((st) => {
        const motion = scene.still_motions?.find((m) => m.cut === st.cut)?.motion ?? 'push';
        const imagePath = params.findStillPath(scene.scene_n, st.cut);
        return imagePath ? { cut: st.cut, motion, imagePath } : null;
      })
      .filter((s): s is { cut: string; motion: string; imagePath: string } => s !== null);

    if (!stillRows.length) {
      throw new StillsKenburnsCompileError(
        `${label}: no still image(s) found (expected ${scene.stills.map((s) => `${label}-${s.cut}`).join('/')})`,
      );
    }

    // F4: VO-length reconciliation — a scene never renders shorter than its
    // real narration, and (opt-in via maxSilentTail) never holds much
    // longer than the VO needs either.
    const voPath = params.findVoPath(scene.scene_n);
    const voDur = voPath ? params.voDurationSec(scene.scene_n) : 0;
    let sceneDur = Math.max(scene.duration_sec, voDur + 0.4);
    if (sceneDur <= scene.duration_sec && params.maxSilentTail != null && voDur > 0) {
      const capped = Math.min(scene.duration_sec, voDur + params.maxSilentTail);
      if (capped < sceneDur) sceneDur = capped;
    }
    const scale = sceneDur / scene.duration_sec;

    const captionChunks = params.sceneCaptions?.[`S${n}`] ?? null;
    const autoSplitDurations =
      !splitPoints && stillRows.length > 1 && (params.enableAutoCutSplit ?? true)
        ? computeAutoSplitDurations(sceneDur, stillRows.length, captionChunks)
        : null;

    const cuts: KenBurnsCut[] = stillRows.map((row, i) => {
      let durationSecs: number;
      if (splitPoints) {
        const relStart = i === 0 ? 0 : splitPoints[i - 1];
        const relEnd = i < splitPoints.length ? splitPoints[i] : scene.duration_sec;
        durationSecs = (relEnd - relStart) * scale;
      } else if (autoSplitDurations) {
        durationSecs = autoSplitDurations[i];
      } else {
        durationSecs = sceneDur / stillRows.length;
      }
      return {
        imagePath: row.imagePath,
        motion: row.motion as KenBurnsCut['motion'],
        regrade: mapGrade(scene.grade),
        cropX: 0.5,
        transition: 'cut',
        durationSecs,
      };
    });

    const fromSec = tcToSec(scene.from_tc);
    const overlays = mergeCaptionOverlays(scene, fromSec, params);

    // mapAudioCue is a pure text→key lookup (no I/O), so compile() resolves
    // it directly rather than requiring the caller to pre-map every scene's
    // 🔊 cue — same treatment as the caption-merge logic just above.
    const { sfx: mappedSfx } = mapAudioCue(scene.audio_cue);
    const sfx = mappedSfx.map((e) => ({ key: e.key, atSec: 0, holdSec: e.hold_sec ?? undefined }));

    scenes.push({
      id: label,
      durationSecs: sceneDur,
      sceneType: 'shot',
      cuts,
      kenBurnsOverlays: overlays.length ? overlays : undefined,
      sfx: sfx.length ? sfx : undefined,
      narrationPath: voPath ?? undefined,
      playbackRate: 1,
      trimInSec: 0,
      sourceMuted: false,
    });
  }

  return {
    contentId: params.contentId,
    aspectRatio: params.aspectRatio ?? '16:9',
    template: 'stills-kenburns',
    scenes,
    watermark: params.watermarkPath
      ? {
          path: params.watermarkPath,
          position: 'bottom-right',
          opacity: params.watermarkOpacity ?? 0.4,
        }
      : undefined,
    musicPlan: params.musicPlan?.map((seg) => ({ ...seg, gainDb: seg.gainDb ?? -23 })),
  };
}
