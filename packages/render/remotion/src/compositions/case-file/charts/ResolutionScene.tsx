import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { loadFont as loadPTSerif } from '@remotion/google-fonts/PTSerif';
import { PALETTE } from '../palette';
import { AppealTimeline, type TimelineVisual } from './AppealTimeline';

const { fontFamily: serifFont } = loadPTSerif();

export type ResolutionVisual = {
  kind: 'resolution';
  counterValue: number;
  counterSuffix?: string;
  timeline: TimelineVisual;
};

// Closing frame: the hook's number and the mechanism's timeline held together
// statically, not a blank end card — the two facts the viewer should leave with.
export const ResolutionScene: React.FC<{ visual: ResolutionVisual }> = ({ visual }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.background, opacity, justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ fontFamily: serifFont, fontWeight: 700, fontSize: 180, color: PALETTE.highlight, margin: 0, lineHeight: 1 }}>
        {visual.counterValue}{visual.counterSuffix ?? ''}
      </p>
      <div style={{ marginTop: 72 }}>
        <AppealTimeline visual={visual.timeline} width={840} static />
      </div>
    </AbsoluteFill>
  );
};
