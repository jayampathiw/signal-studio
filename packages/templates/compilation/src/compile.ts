import { Timeline, type TimelineT, type TimelineSceneT } from '@signal-studio/core/schemas';

/**
 * P2.2 — the `compilation` template's `compile()`: N already-compiled
 * per-episode Timelines → 1 compilation Timeline. Pure function, no I/O.
 *
 * **Deliberate deviation from the plan's literal bullet, flagged rather than
 * silently resolved**: the plan says "compile() reads inputs.jobs[]
 * artifacts". There is no existing mechanism anywhere in this repo for a job
 * to load another job's rendered Timeline by reference — `ArtifactsRepo`
 * (`packages/db/src/repos/artifacts.ts`) is the closest fit, but nothing
 * writes a Timeline to it yet, and building that read/write loop is a
 * dispatcher/worker concern (P2.5), not this template's. This function
 * follows the same convention `clips-overlay`'s `compile()` already
 * established for stage outputs: the caller resolves `inputs.jobs[]` into
 * already-loaded data (here, each episode's own compiled `TimelineT` — e.g.
 * what `clips-overlay`'s `compile()` produced for that episode's manifest)
 * and hands it in directly. Whoever wires `ss run-job` in P2.5 owns the
 * actual artifact fetch.
 */

export type CompilationEpisode = {
  title: string;
  /** An already-compiled, already-validated per-episode Timeline (its own `cta` is ignored — see below). */
  timeline: TimelineT;
};

type MusicTrackT = NonNullable<TimelineT['music']>;
type CtaOverlayT = NonNullable<TimelineT['cta']>;
type WatermarkT = NonNullable<TimelineT['watermark']>;

export type CompileParams = {
  contentId: string;
  outputId?: string;
  music?: MusicTrackT;
  /** The ONE shared end card for the whole compilation — each episode's own `cta` is dropped, never copied. */
  cta: CtaOverlayT;
  watermark?: WatermarkT;
  /** Soft target, from `manifest.compilationTargetS` — exceeding it only warns, never fails or trims. */
  targetSeconds?: number;
};

export const TITLE_PLATE_DURATION_SECS = 1.2;

export class CompilationCompileError extends Error {}

export function compile(episodes: CompilationEpisode[], params: CompileParams): TimelineT {
  if (episodes.length === 0) {
    throw new CompilationCompileError('compile(): at least one episode is required');
  }

  const aspectRatio = episodes[0].timeline.aspectRatio;
  const scenes: TimelineSceneT[] = [];

  episodes.forEach((episode, i) => {
    if (episode.timeline.aspectRatio !== aspectRatio) {
      throw new CompilationCompileError(
        `compile(): episode ${i} ("${episode.title}") has aspectRatio "${episode.timeline.aspectRatio}", expected "${aspectRatio}" — every episode compiled together must share one aspect ratio`,
      );
    }

    scenes.push({
      id: `title-${i}`,
      durationSecs: TITLE_PLATE_DURATION_SECS,
      sceneType: 'title',
      captionText: episode.title,
      playbackRate: 1,
      trimInSec: 0,
      sourceMuted: false,
    });

    // Each episode's own end card is dropped here by construction: only its
    // `scenes` are copied over, never its `cta` — re-compiling from each
    // episode's Timeline (rather than concatenating already-rendered MP4s,
    // which would have an end card baked into the pixels) is exactly what
    // makes this a clean drop instead of a visible splice, per the plan's
    // own rationale for reading Timelines and not MP4s here.
    for (const scene of episode.timeline.scenes) {
      scenes.push({ ...scene, sceneType: 'shot' });
    }
  });

  const totalScreenTimeSecs = scenes.reduce((sum, s) => sum + s.durationSecs, 0);
  if (params.targetSeconds !== undefined && totalScreenTimeSecs > params.targetSeconds) {
    // Soft target, ported from the pilot bridge's render-compilation.ts —
    // warn, don't fail or trim. Deciding which episode/shot to cut isn't a
    // decision this function can make safely on its own.
    console.error(
      `compile(): compiled duration ${totalScreenTimeSecs.toFixed(1)}s exceeds compilationTargetS ${params.targetSeconds}s across ${episodes.length} episode(s) — not trimmed, just flagged`,
    );
  }

  return Timeline.parse({
    contentId: params.contentId,
    aspectRatio,
    scenes,
    music: params.music,
    cta: params.cta,
    watermark: params.watermark,
    template: 'compilation',
    outputId: params.outputId,
  });
}
