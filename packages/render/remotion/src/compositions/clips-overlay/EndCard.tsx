import { loadFont } from '@remotion/fonts';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const FONT_FAMILY = 'Inter';

const waitForFont = delayRender('Loading Inter (800) for EndCard');
loadFont({
  family: FONT_FAMILY,
  url: staticFile('fonts/Inter-ExtraBold.ttf'),
  weight: '800',
})
  .then(() => continueRender(waitForFont))
  .catch((err) => {
    console.error('EndCard: failed to load Inter font', err);
    continueRender(waitForFont);
  });

type Props = {
  /** timeline.v1's CtaOverlay.line1 — the pilot bridge's end_card.subject. */
  line1: string;
  /** timeline.v1's CtaOverlay.line2 — the pilot bridge's end_card.disclosure. */
  line2: string;
};

// Adapted from projects/assemblex-factory/pilot/src/compositions/EndCard.tsx
// (P0.8-05). Two deliberate drops, moving from the pilot's bespoke
// {subject, disclosure, pageName, backgroundStillUrl} props to timeline.v1's
// CtaOverlay {line1, line2}: `pageName` (no Project schema field to source a
// brand display-name from yet — same gap the blbl.v1 adapter already flags
// for `post_id`/`subject`) and `backgroundStillUrl` (a nice-to-have, not
// load-bearing; can come back once there's a real field to carry it).
// Duration (1.5s in the pilot) is now the caller's concern via
// CtaOverlay.durationSecs, not this component's.
export const EndCard: React.FC<Props> = ({ line1, line2 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{ backgroundColor: '#0B0B0F', justifyContent: 'center', alignItems: 'center' }}
    >
      <div style={{ position: 'relative', textAlign: 'center', opacity, padding: '0 64px' }}>
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: 56,
            color: '#FFFFFF',
            margin: '0 0 24px',
          }}
        >
          {line1}
        </p>
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 600,
            fontSize: 40,
            color: 'rgba(255,255,255,0.6)',
            margin: 0,
          }}
        >
          {line2}
        </p>
      </div>
    </AbsoluteFill>
  );
};
