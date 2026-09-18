import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { PALETTE } from '../palette';
import type { TimelineVisual } from './AppealTimeline';

const { fontFamily: monoFont } = loadCourierPrime();

const WIDTH = 900;
const HEIGHT = 340;
const PAD_X = 16;
const PAD_TOP = 24;
const PAD_BOTTOM = 20;

// A declining line — "how much of your appeal window is left" — running from full
// at the notice date down to zero at the real deadline, instead of a flat dot-track.
// Same two real data points as AppealTimeline (startLabel/deadlineLabel/
// deadlineFraction, no new figures invented) rendered as an actual line chart, per
// round-4 feedback: a proper chart shape reads more clearly than a flat bar and
// fills the scene's empty space better.
export const AppealLineChart: React.FC<{
  visual: TimelineVisual;
  width?: number;
  static?: boolean;
}> = ({ visual, width = 900, static: isStatic = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const deadlineFraction = visual.deadlineFraction ?? 1;

  const travel = isStatic
    ? 1
    : interpolate(frame, [10, 2.2 * fps], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
  const arrived = travel >= 0.995;

  const plotWidth = WIDTH - PAD_X * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x0 = PAD_X;
  const y0 = PAD_TOP;
  const x1 = PAD_X + plotWidth * deadlineFraction;
  const y1 = PAD_TOP + plotHeight;

  const curX = x0 + (x1 - x0) * travel;
  const curY = y0 + (y1 - y0) * travel;

  const lineLength = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
  const dashOffset = lineLength * (1 - travel);

  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" style={{ overflow: 'visible' }}>
        {/* baseline grid — decorative, unlabeled (no invented axis values) */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD_X}
            y1={PAD_TOP + plotHeight * f}
            x2={WIDTH - PAD_X}
            y2={PAD_TOP + plotHeight * f}
            stroke={PALETTE.bodyLine}
            strokeWidth={1.5}
            strokeDasharray="2 8"
          />
        ))}
        <line
          x1={PAD_X}
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH - PAD_X}
          y2={HEIGHT - PAD_BOTTOM}
          stroke={PALETTE.bodyLine}
          strokeWidth={2}
        />

        {/* flat continuation past the deadline, showing the window is closed */}
        <line
          x1={x1}
          y1={y1}
          x2={WIDTH - PAD_X}
          y2={y1}
          stroke={PALETTE.bodyLine}
          strokeWidth={4}
          strokeLinecap="round"
        />

        {/* the declining line itself, drawn in over time */}
        <line
          x1={x0}
          y1={y0}
          x2={x1}
          y2={y1}
          stroke={PALETTE.folderTanBottom}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={lineLength}
          strokeDashoffset={dashOffset}
        />

        {/* deadline marker */}
        <circle cx={x1} cy={y1} r={9} fill={PALETTE.highlight} opacity={0.85} />

        {/* moving "you are here" point */}
        {arrived && (
          <circle
            cx={curX}
            cy={curY}
            r={28}
            fill="none"
            stroke={PALETTE.highlight}
            strokeOpacity={0.35}
            strokeWidth={8}
          />
        )}
        <circle cx={curX} cy={curY} r={16} fill={arrived ? PALETTE.highlight : PALETTE.paper} />
      </svg>
      <div
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginTop: 20 }}
      >
        <span
          style={{
            fontFamily: monoFont,
            fontWeight: 700,
            fontSize: 28,
            color: PALETTE.supportingText,
          }}
        >
          {visual.startLabel}
        </span>
        <span
          style={{
            fontFamily: monoFont,
            fontSize: 28,
            color: arrived ? PALETTE.highlight : PALETTE.paper,
            fontWeight: 700,
            textAlign: 'right',
            maxWidth: '55%',
          }}
        >
          {visual.deadlineLabel}
        </span>
      </div>
    </div>
  );
};
