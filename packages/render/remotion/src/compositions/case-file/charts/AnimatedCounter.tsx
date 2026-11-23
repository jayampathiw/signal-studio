import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { loadFont as loadPTSerif } from '@remotion/google-fonts/PTSerif';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { PALETTE } from '../palette';
import { formatCount } from './format-number';

const { fontFamily: serifFont } = loadPTSerif();
const { fontFamily: monoFont } = loadCourierPrime();

export type CounterVisual = {
  kind: 'counter';
  value: number;
  prefix?: string;
  suffix?: string;
  label?: string;
};

// Big animated number count-up — the opening hook of the data-viz format, where the
// statistic itself (not a document) is the first image the viewer sees. As the
// video's opening scene (`opening`) it shows the full figure from frame 0, with no
// fade or count-up: that first frame is the feed preview, and "$0" there undersells
// the hook.
export const AnimatedCounter: React.FC<{
  visual: CounterVisual;
  scale?: number;
  opening?: boolean;
}> = ({ visual, scale = 1, opening = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const countFrames = 1.5 * fps;

  const displayed = opening
    ? visual.value
    : Math.round(
        interpolate(frame, [0, countFrames], [0, visual.value], {
          extrapolateRight: 'clamp',
          easing: (t) => 1 - (1 - t) * (1 - t), // ease-out
        }),
      );
  const opacity = opening ? 1 : interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' });

  // Auto-shrink for longer strings ("$893M" vs "95%") so nothing overflows a
  // 1080px-wide vertical frame — authored per-case scale tuning shouldn't be needed
  // for the common case of a longer number/prefix/suffix combination.
  const shown = formatCount(displayed);
  const charLen = `${visual.prefix ?? ''}${shown}${visual.suffix ?? ''}`.length;
  const autoScale = Math.min(1, 3.2 / charLen);
  const finalScale = scale * autoScale;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PALETTE.background,
        justifyContent: 'center',
        alignItems: 'center',
        opacity,
      }}
    >
      <p
        style={{
          fontFamily: serifFont,
          fontWeight: 700,
          fontSize: 260 * finalScale,
          color: PALETTE.highlight,
          margin: 0,
          lineHeight: 1,
        }}
      >
        {visual.prefix ?? ''}
        {shown}
        {visual.suffix ?? ''}
      </p>
      {visual.label && (
        <p
          style={{
            fontFamily: monoFont,
            fontWeight: 700,
            fontSize: 52,
            lineHeight: 1.3,
            color: PALETTE.paper,
            marginTop: 28,
            textAlign: 'center',
            textWrap: 'balance',
            maxWidth: 840,
          }}
        >
          {visual.label}
        </p>
      )}
    </AbsoluteFill>
  );
};
