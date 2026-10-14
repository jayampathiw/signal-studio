import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

import { dbToLinear, duckMultiplier } from './audio-duck';
import { EndCard } from './EndCard';
import { FactOverlay } from './FactOverlay';
import { Watermark } from './Watermark';
import { resolveAsset } from '../resolve-asset';

/**
 * P2.1 — `clips-overlay`'s Remotion composition. Merged from the pilot
 * bridge's Post.tsx + ShotSequence.tsx (P0.8-05/06) into one file (the
 * split had no independent reuse — ShotSequence only ever appeared inside
 * Post). Props are named and shaped after `timeline.v1`'s own fields
 * (TimelineScene/MusicTrack/CtaOverlay/Watermark from
 * `@signal-studio/core/schemas`), not the pilot's bespoke PostProps —
 * following the CaseFile composition's existing convention here: a
 * dedicated prop type per composition (not the raw zod type), but every
 * field traces to a Timeline field rather than to a template-specific
 * intermediate shape. `render.ts`'s `timelineToProps()` does the actual
 * Timeline → these props mapping (staging local asset paths, etc.), the
 * same job it already does for CaseFile/NewsCard.
 */

export type ClipsOverlaySceneProps = {
  id: string;
  /** Screen-time duration, seconds — already divided by playbackRate. */
  durationSecs: number;
  clipUrl: string;
  trimInSec: number;
  playbackRate: number;
  sourceMuted: boolean;
  overlay?: { text: string; inSec: number; outSec: number };
  narrationUrl?: string;
  voStartSec?: number;
};

export type ClipsOverlayProps = {
  scenes: ClipsOverlaySceneProps[];
  musicUrl?: string;
  musicGainDb: number;
  musicDuck: boolean;
  musicFadeOutSecs: number;
  cta?: { line1: string; line2: string; durationSecs: number };
  watermarkText?: string;
};

export function shotDurationInFrames(scene: ClipsOverlaySceneProps, fps: number): number {
  return Math.round(scene.durationSecs * fps);
}

export function totalClipsOverlayFrames(props: ClipsOverlayProps, fps: number): number {
  const shotFrames = props.scenes.reduce((sum, s) => sum + shotDurationInFrames(s, fps), 0);
  const ctaFrames = props.cta ? Math.round(props.cta.durationSecs * fps) : 0;
  return shotFrames + ctaFrames;
}

const MusicBed: React.FC<{ props: ClipsOverlayProps; voWindows: Array<[number, number]> }> = ({
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

export const ClipsOverlay: React.FC<ClipsOverlayProps> = (props) => {
  const { fps, width, height } = useVideoConfig();

  let cursor = 0;
  const shotFrames = props.scenes.map((scene) => {
    const from = cursor;
    const duration = shotDurationInFrames(scene, fps);
    cursor += duration;
    return { scene, from, duration };
  });
  const ctaFrom = cursor;
  const ctaDuration = props.cta ? Math.round(props.cta.durationSecs * fps) : 0;

  const voWindows: Array<[number, number]> = shotFrames
    .filter(({ scene }) => scene.narrationUrl && scene.voStartSec !== undefined)
    .map(({ scene, from }) => {
      const voStart = from + Math.round((scene.voStartSec ?? 0) * fps);
      // Narration duration isn't tracked separately from the shot's own
      // durationSecs here (unlike the pilot's PostShotProps.voiceoverDurationS)
      // — ducking runs for the rest of the shot's screen time instead of
      // ending exactly when narration does. A slightly longer duck window
      // than strictly necessary is the safer error to make musically.
      return [voStart, from + shotFrames.find((sf) => sf.scene === scene)!.duration] as [
        number,
        number,
      ];
    });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {shotFrames.map(({ scene, from, duration }) => (
        <Sequence key={scene.id} from={from} durationInFrames={duration}>
          <OffthreadVideo
            src={resolveAsset(scene.clipUrl)}
            startFrom={Math.round(scene.trimInSec * fps)}
            playbackRate={scene.playbackRate}
            muted={scene.sourceMuted}
            volume={0.8}
            style={{ width, height, objectFit: 'cover' }}
          />
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
