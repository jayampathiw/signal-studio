import { loadFont } from '@remotion/google-fonts/PTSerif';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { PALETTE } from '../palette';

const { fontFamily } = loadFont();

// compile() refuses a card that would wrap past 4 lines at this size.
const POINTER_CARD_FONT_PX = 56;

export type PointerCardVisual = {
  kind: 'pointerCard';
  text: string;
};

// Generic plain text card — PT Serif, 56 px or more for a 55+ audience on phones, on brand background, no folder graphic —
// for any beat that's a bare statement rather than a document or a stat (a
// cross-promo pointer, a checklist call-out, a plain-text narrative beat). Kept
// deliberately unadorned so it doesn't compete with the outro card's own
// brand-identity moment (brand doc §3 reserves that visual for the outro).
// `text` supports explicit `\n` line breaks, each rendered as its own line block.
export const PointerCard: React.FC<{ visual: PointerCardVisual; opening?: boolean }> = ({
  visual,
  opening = false,
}) => {
  const frame = useCurrentFrame();
  const opacity = opening
    ? 1
    : interpolate(frame, [0, 12, 999999], [0, 1, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PALETTE.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 80px',
      }}
    >
      {/* One block per `\n` line: text-wrap balance doesn't act across forced breaks. */}
      <div style={{ opacity }}>
        {visual.text.split('\n').map((line, i) => (
          <p
            key={i}
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize: POINTER_CARD_FONT_PX,
              color: PALETTE.paper,
              textAlign: 'center',
              lineHeight: 1.3,
              textWrap: 'balance',
              margin: 0,
            }}
          >
            {line}
          </p>
        ))}
      </div>
    </AbsoluteFill>
  );
};
