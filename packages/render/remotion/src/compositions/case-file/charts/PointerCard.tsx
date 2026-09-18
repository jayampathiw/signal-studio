import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { PALETTE } from '../palette';

const { fontFamily: monoFont } = loadCourierPrime();

export type PointerCardVisual = {
  kind: 'pointerCard';
  text: string;
};

// Generic plain text card — Courier Prime on brand background, no folder graphic —
// for any beat that's a bare statement rather than a document or a stat (a
// cross-promo pointer, a checklist call-out, a plain-text narrative beat). Kept
// deliberately unadorned so it doesn't compete with the outro card's own
// brand-identity moment (brand doc §3 reserves that visual for the outro).
// `text` supports explicit `\n` line breaks (whiteSpace: 'pre-line' below).
export const PointerCard: React.FC<{ visual: PointerCardVisual }> = ({ visual }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 999999], [0, 1, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PALETTE.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 80px',
      }}
    >
      <p
        style={{
          fontFamily: monoFont,
          fontWeight: 700,
          fontSize: 44,
          color: PALETTE.paper,
          textAlign: 'center',
          lineHeight: 1.4,
          whiteSpace: 'pre-line',
          opacity,
          margin: 0,
        }}
      >
        {visual.text}
      </p>
    </AbsoluteFill>
  );
};
