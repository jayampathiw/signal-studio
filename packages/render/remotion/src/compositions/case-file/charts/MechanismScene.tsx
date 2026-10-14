import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { PALETTE } from '../palette';
import { AppealLineChart } from './AppealLineChart';
import type { TimelineVisual } from './AppealTimeline';
import type { BarDatum } from './BarChart';

const { fontFamily: monoFont } = loadCourierPrime();

export type MechanismVisual = {
  kind: 'mechanism';
  bars: BarDatum[];
  barUnit?: string;
  barMax?: number;
  timeline: TimelineVisual;
};

// Round-3 feedback: the small corner recap of Scene 3's bar chart was too cramped
// to read and left the rest of the frame empty — dropped it (the comparison was
// already shown in full in Scene 3) in favor of one large, legible chart that
// actually fills the frame. Round-4 feedback: a flat dot-on-a-bar didn't read as a
// real chart — replaced with a declining line chart (AppealLineChart), same real
// timeline data, drawn as an actual "time running out" line instead of a bar.
export const MechanismScene: React.FC<{ visual: MechanismVisual }> = ({ visual }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.background, opacity }}>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p
          style={{
            fontFamily: monoFont,
            fontWeight: 700,
            fontSize: 38,
            letterSpacing: 2,
            color: PALETTE.supportingText,
            marginBottom: 48,
          }}
        >
          THE APPEAL WINDOW
        </p>
        <AppealLineChart visual={visual.timeline} width={900} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
