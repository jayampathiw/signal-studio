import type {
  CaptionWordT as CaptionWord,
  HighlightBoxT as HighlightBox,
  TimelineSceneT,
  TimelineT,
} from '@signal-studio/core/schemas';

/**
 * P3.3 — the `case-file` template's `compile()`: ported from
 * `apps/video/scripts/policy-file/assemble-case.mjs`'s own Timeline-building
 * logic, following the same "push I/O to the caller" shift P3.1/P3.2
 * already made. `compile()` is pure — no VO synthesis, no Whisper
 * transcription, no `ffprobe` duration measurement. The caller (whoever
 * runs the `tts`/asset-resolution stages first) supplies already-resolved
 * narration paths, measured durations, and transcribed words per scene via
 * `params`'s resolver functions, same convention as `stills-kenburns`'s
 * `findVoPath`/`voDurationSec`/`sceneCaptions`.
 *
 * **Caption text is the real transcript, not the authored script** — ported
 * unchanged from `assemble-case.mjs`'s own header rationale: TTS output can
 * drift from the authored `narrationText` (dropped words, different
 * contractions), so a separately-authored caption line can never be
 * guaranteed to match the audio word-for-word. `compile()` builds
 * `captionText` from `params.transcribedWords()`'s own text, falling back to
 * `scene.captionText` only for a scene with no narration at all.
 *
 * **Scene duration is derived from measured VO, not authored** — same
 * reasoning: `case.json`'s `durationSecs` is only a fallback for a silent
 * connective scene; a scene with narration is sized to
 * `voDurationSec + TAIL_PADDING_SECS + holdExtraSecs`.
 */

// Trailing breathing room after narration ends before the scene cuts —
// ported unchanged from assemble-case.mjs.
const TAIL_PADDING_SECS = 0.5;

export type CaseFileHighlightInput = {
  x: number;
  y: number;
  width: number;
  height: number;
  fromSec?: number;
  toSec?: number;
  fromFraction?: number;
  toFraction?: number;
  opacity?: number;
};

export type CaseFileSceneInput = {
  id: string;
  // Present when this scene has its own document image; omitted means
  // "carry the previous scene's document forward" (CaseFile.tsx's own
  // continuity behavior — compile() doesn't need to resolve this itself).
  imagePath?: string;
  narrationText?: string;
  captionText?: string;
  durationSecs?: number; // fallback, used only when there's no narration
  holdExtraSecs?: number;
  highlight?: CaseFileHighlightInput;
  highlights?: CaseFileHighlightInput[];
  zoomFrom?: { x: number; y: number; width: number; height: number };
  zoomTo?: { x: number; y: number; width: number; height: number };
  visual?: Record<string, unknown>;
  waveformOverlay?: boolean;
};

export type CaseFileCompileParams = {
  contentId: string;
  aspectRatio?: '16:9' | '9:16';
  scenes: CaseFileSceneInput[];
  caseId: string;
  sourceCitation?: string;
  hideSourceOnScreen?: boolean;
  specimen?: boolean;
  showOutro?: boolean;
  // Real, already-synthesized narration path for a scene, or null if this
  // scene has no narration (a silent connective beat).
  findNarrationPath: (sceneId: string) => string | null;
  // Real, already-measured narration duration in seconds (e.g. via
  // ffprobe) — only called when findNarrationPath() returned non-null.
  narrationDurationSec: (sceneId: string) => number;
  // Real Whisper word timestamps for a scene's narration, already run
  // through generateWordTimestamps() by the caller — only called when
  // findNarrationPath() returned non-null.
  transcribedWords: (sceneId: string) => CaptionWord[] | null;
  watermarkPath?: string;
  watermarkOpacity?: number;
};

export class CaseFileCompileError extends Error {}

function resolveHighlight(
  h: CaseFileHighlightInput | undefined,
  durationSecs: number,
): HighlightBox | undefined {
  if (!h) return undefined;
  const usesFraction = h.fromFraction != null || h.toFraction != null;
  const fromSec = usesFraction ? (h.fromFraction ?? 0) * durationSecs : (h.fromSec ?? 0);
  const toSec = usesFraction ? (h.toFraction ?? 1) * durationSecs : (h.toSec ?? durationSecs);
  return {
    x: h.x,
    y: h.y,
    width: h.width,
    height: h.height,
    fromSec,
    toSec,
    opacity: h.opacity ?? 0.55,
  };
}

export function compile(params: CaseFileCompileParams): TimelineT {
  if (!params.scenes.length) {
    throw new CaseFileCompileError(`${params.caseId}: case has no scenes`);
  }

  const scenes: TimelineSceneT[] = params.scenes.map((scene) => {
    const narrationPath = params.findNarrationPath(scene.id);
    const hasNarration = narrationPath != null;
    const voDur = hasNarration ? params.narrationDurationSec(scene.id) : 0;
    const durationSecs = hasNarration
      ? voDur + TAIL_PADDING_SECS + (scene.holdExtraSecs ?? 0)
      : (scene.durationSecs ?? 3);

    const words = hasNarration ? params.transcribedWords(scene.id) : null;
    const captionText = words?.length ? words.map((w) => w.text).join(' ') : scene.captionText;

    const highlights = scene.highlights
      ? scene.highlights
          .map((h) => resolveHighlight(h, durationSecs))
          .filter((h): h is HighlightBox => h != null)
      : scene.highlight
        ? [resolveHighlight(scene.highlight, durationSecs)].filter(
            (h): h is HighlightBox => h != null,
          )
        : [];

    return {
      id: scene.id,
      durationSecs,
      source: scene.imagePath ? { localPath: scene.imagePath, type: 'image' } : undefined,
      narrationPath: narrationPath ?? undefined,
      captionText,
      highlights: highlights.length ? highlights : undefined,
      zoomFrom: scene.zoomFrom,
      zoomTo: scene.zoomTo,
      visual: scene.visual,
      waveformOverlay: scene.waveformOverlay,
      words: words ?? undefined,
      playbackRate: 1,
      trimInSec: 0,
      sourceMuted: false,
      sceneType: 'shot',
    };
  });

  return {
    contentId: params.contentId,
    aspectRatio: params.aspectRatio ?? '16:9',
    template: 'case-file',
    scenes,
    caseMeta: {
      caseId: params.caseId,
      sourceCitation: params.hideSourceOnScreen ? undefined : params.sourceCitation,
      specimen: params.specimen ?? false,
      showOutro: params.showOutro ?? true,
    },
    watermark: params.watermarkPath
      ? {
          path: params.watermarkPath,
          position: 'bottom-right',
          opacity: params.watermarkOpacity ?? 0.9,
        }
      : undefined,
  };
}
