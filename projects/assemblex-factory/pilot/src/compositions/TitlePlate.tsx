import { loadFont } from '@remotion/fonts';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

import { CROSSFADE_FRAMES } from '../props';

const FONT_FAMILY = 'Inter';

const waitForFont = delayRender('Loading Inter (800) for TitlePlate');
loadFont({
  family: FONT_FAMILY,
  url: staticFile('fonts/Inter-ExtraBold.ttf'),
  weight: '800',
})
  .then(() => continueRender(waitForFont))
  .catch((err) => {
    console.error('TitlePlate: failed to load Inter font', err);
    continueRender(waitForFont);
  });

type Props = {
  title: string;
  /** This plate's own duration (its enclosing Sequence's), not the whole composition's. */
  durationInFrames: number;
};

// 1.2s (enforced by the caller via titlePlateFrames), fades out over its
// last CROSSFADE_FRAMES so it crossfades into the episode body that starts
// underneath it (P0.8-07).
export const TitlePlate: React.FC<Props> = ({ title, durationInFrames }) => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - CROSSFADE_FRAMES, durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );

  // Opacity applies to the whole card — background included — not just the
  // text. An opaque background that never fades would fully occlude the
  // episode body playing underneath during the crossfade window regardless
  // of the text's own opacity.
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0B0B0F',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: Math.min(fadeIn, fadeOut),
      }}
    >
      <p
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: 800,
          fontSize: 64,
          color: '#FFFFFF',
          textAlign: 'center',
          padding: '0 64px',
          margin: 0,
        }}
      >
        {title}
      </p>
    </AbsoluteFill>
  );
};
