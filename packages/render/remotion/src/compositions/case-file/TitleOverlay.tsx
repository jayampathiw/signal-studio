import { loadFont } from '@remotion/google-fonts/PTSerif';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { PALETTE } from './palette';

const { fontFamily } = loadFont();

type Props = {
  text: string;
  inSec: number;
  outSec: number;
};

// Shot 1's title (`overlay_text`): a navy band in the top third, above the
// highlight auto-zoom frames at ~34% and the captions at 55%. Solid from its
// first frame — at 0s that's the feed preview — and fades out at `outSec`.
export const TitleOverlay: React.FC<Props> = ({ text, inSec, outSec }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  if (t < inSec || t >= outSec) return null;
  const opacity = interpolate(t, [outSec - 0.25, outSec], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: height * 0.08,
          left: 0,
          right: 0,
          background: PALETTE.background,
          padding: '28px 56px',
          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          opacity,
        }}
      >
        <p
          style={{
            fontFamily,
            fontWeight: 700,
            fontSize: 68,
            lineHeight: 1.15,
            color: PALETTE.paper,
            textAlign: 'center',
            textWrap: 'balance',
            margin: 0,
          }}
        >
          {text}
        </p>
      </div>
    </AbsoluteFill>
  );
};
