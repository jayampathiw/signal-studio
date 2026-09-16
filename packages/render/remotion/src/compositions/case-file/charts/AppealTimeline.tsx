import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { PALETTE } from '../palette';

const { fontFamily: monoFont } = loadCourierPrime();

export type TimelineVisual = {
  kind: 'timeline';
  startLabel: string;
  deadlineLabel: string;
  deadlineFraction?: number; // 0-1 along the track where the deadline marker sits (default 1)
};

// A short horizontal track from "notice given" to the real appeal deadline, with a
// marker that travels the track and turns highlight-yellow on arrival — the actual
// CMS rule (file by noon the day before coverage ends), not a generic "days" count,
// per the verified figure used in this case's narration.
export const AppealTimeline: React.FC<{ visual: TimelineVisual; width?: number; static?: boolean }> = ({
  visual,
  width = 900,
  static: isStatic = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const deadlineFraction = visual.deadlineFraction ?? 1;

  const travel = isStatic ? deadlineFraction : interpolate(frame, [10, 2 * fps], [0, deadlineFraction], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const arrived = travel >= deadlineFraction - 0.005;

  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', height: 12, borderRadius: 6, background: PALETTE.bodyLine, position: 'relative' }}>
        <div style={{ width: `${deadlineFraction * 100}%`, height: '100%', borderRadius: 6, background: PALETTE.folderTanBottom }} />
        <div
          style={{
            position: 'absolute',
            left: `${travel * 100}%`,
            top: '50%',
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: arrived ? PALETTE.highlight : PALETTE.paper,
            transform: 'translate(-50%, -50%)',
            boxShadow: arrived ? `0 0 0 10px ${PALETTE.highlight}55` : 'none',
          }}
        />
      </div>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
        <span style={{ fontFamily: monoFont, fontWeight: 700, fontSize: 28, color: PALETTE.supportingText }}>{visual.startLabel}</span>
        <span style={{
          fontFamily: monoFont, fontSize: 28, color: arrived ? PALETTE.highlight : PALETTE.paper, fontWeight: 700,
          textAlign: 'right', maxWidth: '55%',
        }}>
          {visual.deadlineLabel}
        </span>
      </div>
    </div>
  );
};
