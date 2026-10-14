import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { CROSSFADE_FRAMES } from './timing';
import { TitlePlate } from './TitlePlate';
import { dbToLinear, duckMultiplier } from '../clips-overlay/audio-duck';
import { EndCard } from '../clips-overlay/EndCard';
import { FactOverlay } from '../clips-overlay/FactOverlay';
import { Watermark } from '../clips-overlay/Watermark';
import { resolveAsset } from '../resolve-asset';

export { CROSSFADE_FRAMES };

/**
 * P2.2 — `compilation`'s Remotion composition. Ported from the pilot
 * bridge's Compilation.tsx + TitlePlate.tsx (P0.8-07), but reading a flat
 * `scenes[]` (each tagged `sceneType: 'shot' | 'title'`) instead of the
 * pilot's nested `episodes[]` — `timeline.v1` has no episode-grouping
 * concept (see `packages/templates/compilation/src/compile.ts`'s own header
 * for why), so `compile()` flattens each episode into a title scene
 * followed by its shot scenes, and this composition re-derives episode
 * boundaries implicitly from where 'title' scenes fall. Reuses
 * EndCard/FactOverlay/Watermark/audio-duck from the `clips-overlay`
 * composition rather than duplicating them — they're template-agnostic,
 * Timeline-shaped pieces, not clips-overlay-specific.
 */

export type CompilationSceneProps = {
  id: string;
  sceneType: 'shot' | 'title';
  /** Screen-time duration, seconds. For a 'title' scene, its own plate duration. */
  durationSecs: number;
  /** 'title' scenes only. */
  captionText?: string;
  /** 'shot' scenes only. */
  clipUrl?: string;
  trimInSec?: number;
  playbackRate?: number;
  sourceMuted?: boolean;
  overlay?: { text: string; inSec: number; outSec: number };
  narrationUrl?: string;
  voStartSec?: number;
};

export type CompilationProps = {
  scenes: CompilationSceneProps[];
  musicUrl?: string;
  musicGainDb: number;
  musicDuck: boolean;
  musicFadeOutSecs: number;
  cta?: { line1: string; line2: string; durationSecs: number };
  watermarkText?: string;
};

type Positioned = { scene: CompilationSceneProps; from: number; duration: number };

// Title and its own following shot(s) crossfade (body starts CROSSFADE_FRAMES
// before the title plate ends); every other consecutive pair (shot→shot,
// shot→next episode's title) is a hard cut. This single pass reproduces the
// pilot's per-episode "titleFrom / bodyFrom = titleFrom + titleDur -
// CROSSFADE" math without needing an explicit episodes[] grouping — a
// 'title' scene's own duration always gets the crossfade trim applied to
// what comes right after it; nothing else does.
function positionScenes(scenes: CompilationSceneProps[], fps: number): Positioned[] {
  const positioned: Positioned[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    const from = cursor;
    const duration = Math.round(scene.durationSecs * fps);
    positioned.push({ scene, from, duration });
    cursor = scene.sceneType === 'title' ? from + duration - CROSSFADE_FRAMES : from + duration;
  }
  return positioned;
}

export function totalCompilationFrames(props: CompilationProps, fps: number): number {
  const positioned = positionScenes(props.scenes, fps);
  const last = positioned.at(-1);
  const bodyEnd = last ? last.from + last.duration : 0;
  const ctaFrames = props.cta ? Math.round(props.cta.durationSecs * fps) : 0;
  return bodyEnd + ctaFrames;
}

const MusicBed: React.FC<{ props: CompilationProps; voWindows: Array<[number, number]> }> = ({
  props,
  voWindows,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  if (!props.musicUrl) return null;

  const baseGain = dbToLinear(props.musicGainDb);
  const duckGain = props.musicDuck ? duckMultiplier(frame, voWindows) : 1;
  const fadeOutFrames = Math.round(props.musicFadeOutSecs * fps);
  const fadeGain = interpolate(
    frame,
    [durationInFrames - fadeOutFrames, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return <Audio src={resolveAsset(props.musicUrl)} loop volume={baseGain * duckGain * fadeGain} />;
};

export const Compilation: React.FC<CompilationProps> = (props) => {
  const { fps, width, height } = useVideoConfig();

  const positioned = positionScenes(props.scenes, fps);
  const shots = positioned.filter((p) => p.scene.sceneType === 'shot');
  const titles = positioned.filter((p) => p.scene.sceneType === 'title');

  const lastPositioned = positioned.at(-1);
  const ctaFrom = lastPositioned ? lastPositioned.from + lastPositioned.duration : 0;
  const ctaDuration = props.cta ? Math.round(props.cta.durationSecs * fps) : 0;

  const voWindows: Array<[number, number]> = shots
    .filter(({ scene }) => scene.narrationUrl && scene.voStartSec !== undefined)
    .map(({ scene, from, duration }) => {
      const voStart = from + Math.round((scene.voStartSec ?? 0) * fps);
      return [voStart, from + duration] as [number, number];
    });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Shots render first (underneath); titles render after (on top) — see
          this file's header. Non-overlapping Sequences never paint at the
          same time regardless of this ordering, so only each title's own
          crossfade window (with the shot immediately following it) is
          actually affected, and this ordering makes that one pairing
          correct without needing per-episode grouping. */}
      {shots.map(({ scene, from, duration }) => (
        <Sequence key={scene.id} from={from} durationInFrames={duration}>
          {scene.clipUrl && (
            <OffthreadVideo
              src={resolveAsset(scene.clipUrl)}
              startFrom={Math.round((scene.trimInSec ?? 0) * fps)}
              playbackRate={scene.playbackRate ?? 1}
              muted={scene.sourceMuted ?? false}
              volume={0.8}
              style={{ width, height, objectFit: 'cover' }}
            />
          )}
          {scene.overlay && (
            <FactOverlay
              text={scene.overlay.text}
              inFrame={Math.round(scene.overlay.inSec * fps)}
              outFrame={Math.round(scene.overlay.outSec * fps)}
            />
          )}
          {scene.narrationUrl && (
            <Sequence from={Math.round((scene.voStartSec ?? 0) * fps)}>
              <Audio src={resolveAsset(scene.narrationUrl)} />
            </Sequence>
          )}
        </Sequence>
      ))}

      {titles.map(({ scene, from, duration }) => (
        <Sequence key={scene.id} from={from} durationInFrames={duration}>
          <TitlePlate title={scene.captionText ?? ''} durationInFrames={duration} />
        </Sequence>
      ))}

      <MusicBed props={props} voWindows={voWindows} />

      {props.cta && (
        <Sequence from={ctaFrom} durationInFrames={ctaDuration}>
          <EndCard line1={props.cta.line1} line2={props.cta.line2} />
        </Sequence>
      )}

      {props.watermarkText && <Watermark text={props.watermarkText} />}
    </AbsoluteFill>
  );
};
