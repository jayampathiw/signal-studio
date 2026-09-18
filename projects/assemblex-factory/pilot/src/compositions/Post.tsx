import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';

import { EndCard } from './EndCard';
import { ShotSequence } from './ShotSequence';
import { Watermark } from './Watermark';
import { dbToLinear, duckMultiplier } from '../audio-duck';
import { END_CARD_FRAMES, shotDurationInFrames, visibleShots, type PostProps } from '../props';

export const Post: React.FC<PostProps> = (props) => {
  const { fps } = useVideoConfig();
  const shots = visibleShots(props);

  let cursor = 0;
  const shotFrames = shots.map((shot) => {
    const from = cursor;
    const duration = shotDurationInFrames(shot, fps);
    cursor += duration;
    return { shot, from, duration };
  });
  const endCardFrom = cursor;
  const endCardDuration = END_CARD_FRAMES(fps);

  const voWindows: Array<[number, number]> = shotFrames.map(({ shot, from }) => {
    const voStart = from + Math.round(shot.overlayInS * fps);
    const voEnd = voStart + Math.round(shot.voiceoverDurationS * fps);
    return [voStart, voEnd];
  });

  const musicGain = dbToLinear(props.musicGainDb);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {shotFrames.map(({ shot, from, duration }) => (
        <ShotSequence key={shot.id} shot={shot} from={from} duration={duration} />
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
