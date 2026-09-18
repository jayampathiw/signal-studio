import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { PALETTE } from '../palette';

const { fontFamily: monoFont } = loadCourierPrime();

export type BarDatum = { label: string; value: number };
export type BarChartVisual = {
  kind: 'barChart';
  bars: BarDatum[];
  maxValue?: number;
  unit?: string;
};

// Two (or more) labeled horizontal bars that animate in from zero — the "Denials
// Appealed" vs "Overturned When Appealed" comparison. `mini` renders a smaller,
// static (fully-grown) recap version. The value is placed OUTSIDE the track, to
// its right, at a fixed position — not overlaid on the filled portion — so it's
// always fully visible regardless of how short the bar's fill is (a low-value bar
// like "18%" used to clip its own label against the track edge).
export const BarChart: React.FC<{ visual: BarChartVisual; mini?: boolean; animate?: boolean }> = ({
  visual,
  mini = false,
  animate = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const max = visual.maxValue ?? Math.max(...visual.bars.map((b) => b.value)) * 1.1;
  const growFrames = 1.2 * fps;

  const barHeight = mini ? 30 : 90;
  const gap = mini ? 16 : 56;
  const labelFontSize = mini ? 16 : 32;
  const valueFontSize = mini ? 18 : 44;
  const trackWidth = mini ? 220 : 720;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {visual.bars.map((bar, i) => {
        const t = animate
          ? interpolate(frame, [i * 10, i * 10 + growFrames], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 1;
        const widthPct = (bar.value / max) * t * 100;
        return (
          <div key={bar.label}>
            <div
              style={{
                fontFamily: monoFont,
                fontWeight: 700,
                fontSize: labelFontSize,
                color: PALETTE.paper,
                marginBottom: mini ? 6 : 16,
              }}
            >
              {bar.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: mini ? 12 : 24 }}>
              <div
                style={{
                  width: trackWidth,
                  height: barHeight,
                  background: PALETTE.backgroundShadow,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{ width: `${widthPct}%`, height: '100%', background: PALETTE.highlight }}
                />
              </div>
              <span
                style={{
                  fontFamily: monoFont,
                  fontSize: valueFontSize,
                  color: PALETTE.highlight,
                  fontWeight: 700,
                  minWidth: mini ? 48 : 110,
                }}
              >
                {Math.round(bar.value * t)}
                {visual.unit ?? ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
