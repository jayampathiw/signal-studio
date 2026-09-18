import { Fragment } from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';

import { EndCard } from './EndCard';
import { ShotSequence } from './ShotSequence';
import { TitlePlate } from './TitlePlate';
import { Watermark } from './Watermark';
import { dbToLinear, duckMultiplier } from '../audio-duck';
import {
  CROSSFADE_FRAMES,
  END_CARD_FRAMES,
  episodeBodyFrames,
  shotDurationInFrames,
  titlePlateFrames,
  type CompilationProps,
} from '../props';

export const Compilation: React.FC<CompilationProps> = (props) => {
  const { fps } = useVideoConfig();
  const titleDur = titlePlateFrames(fps);

  // Title plate and episode body overlap by CROSSFADE_FRAMES (crossfade, not
  // a cut): the body starts CROSSFADE_FRAMES before the title plate ends.
  // Episodes themselves are hard cuts (no overlap between one episode's body
  // and the next episode's title plate).
  let cursor = 0;
  const episodes = props.episodes.map((ep) => {
    const titleFrom = cursor;
    const bodyFrom = titleFrom + titleDur - CROSSFADE_FRAMES;
    const bodyDur = episodeBodyFrames(ep.shots, fps);

    let shotCursor = bodyFrom;
    const shotFrames = ep.shots.map((shot) => {
      const from = shotCursor;
      const duration = shotDurationInFrames(shot, fps);
      shotCursor += duration;
      return { shot, from, duration };
    });

    cursor = bodyFrom + bodyDur;
    return { title: ep.title, titleFrom, titleDur, shotFrames };
  });

  const endCardFrom = cursor;
  const endCardDuration = END_CARD_FRAMES(fps);

  const voWindows: Array<[number, number]> = episodes.flatMap((ep) =>
    ep.shotFrames.map(({ shot, from }) => {
      const voStart = from + Math.round(shot.overlayInS * fps);
      const voEnd = voStart + Math.round(shot.voiceoverDurationS * fps);
      return [voStart, voEnd] as [number, number];
    }),
  );

  const musicGain = dbToLinear(props.musicGainDb);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Body renders BEFORE (i.e. underneath) the title plate in DOM/stacking
          order: the title plate needs to sit on top so its fade-out actually
          reveals the body playing beneath it during the overlap window. With
          the reverse order the opaque body would just hard-cut in front of
          the (invisible, occluded) fading title instead of crossfading. */}
      {episodes.map((ep, i) => (
        <Fragment key={i}>
          {ep.shotFrames.map(({ shot, from, duration }) => (
            <ShotSequence key={shot.id} shot={shot} from={from} duration={duration} />
          ))}
          <Sequence from={ep.titleFrom} durationInFrames={ep.titleDur}>
            <TitlePlate title={ep.title} durationInFrames={ep.titleDur} />
          </Sequence>
        </Fragment>
      ))}

      {props.musicUrl ? (
        <Audio
          src={props.musicUrl}
          loop
          volume={
            props.musicDuck ? (frame) => musicGain * duckMultiplier(frame, voWindows) : musicGain
          }
        />
      ) : null}

      <Sequence from={endCardFrom} durationInFrames={endCardDuration}>
        <EndCard
          subject={props.endCard.subject}
          disclosure={props.endCard.disclosure}
          pageName={props.endCard.pageName}
          backgroundStillUrl={props.endCard.backgroundStillUrl}
        />
      </Sequence>

      <Watermark text={props.watermarkText} />
    </AbsoluteFill>
  );
};
