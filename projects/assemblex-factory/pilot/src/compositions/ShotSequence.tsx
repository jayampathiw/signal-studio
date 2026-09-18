import { Audio, OffthreadVideo, Sequence, useVideoConfig } from 'remotion';

import { FactOverlay } from './FactOverlay';
import type { PostShotProps } from '../props';

type Props = {
  shot: PostShotProps;
  from: number;
  duration: number;
};

// One shot's video + fact overlay + VO — shared by Post (per-post, followed
// by an EndCard) and Compilation (per-episode, no per-episode EndCard).
export const ShotSequence: React.FC<Props> = ({ shot, from, duration }) => {
  const { fps, width, height } = useVideoConfig();

  return (
    <Sequence from={from} durationInFrames={duration}>
      <OffthreadVideo
        src={shot.clipUrl}
        startFrom={Math.round(shot.trimInS * fps)}
        playbackRate={shot.speed}
        muted={!shot.keepNativeSfx}
        volume={0.8}
        style={{ width, height, objectFit: 'cover' }}
      />
      <FactOverlay
        text={shot.overlayText}
        inFrame={Math.round(shot.overlayInS * fps)}
        outFrame={Math.round(shot.overlayOutS * fps)}
      />
      <Sequence from={Math.round(shot.overlayInS * fps)}>
        <Audio src={shot.voiceoverUrl} />
      </Sequence>
    </Sequence>
  );
};
