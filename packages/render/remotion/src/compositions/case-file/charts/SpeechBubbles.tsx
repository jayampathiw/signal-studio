import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { PALETTE } from '../palette';

const { fontFamily: monoFont } = loadCourierPrime();

export type SpeechBubblesVisual = {
  kind: 'speechBubbles';
  leftLabel: string;
  leftText: string;
  rightLabel: string;
  rightText: string;
  rightHighlighted?: boolean;
  matched: boolean; // false = "no match" (mechanism beat), true = "confirmed" (resolution beat)
};

// Two speech bubbles side by side — the scam's fake claim vs. the family's real
// verification phrase — with a match/no-match indicator. Reused across the mechanism
// scene (matched=false, right bubble highlighted as "the actionable element") and the
// resolution scene (matched=true, checkmark), so the graphic itself carries the "this
// gets resolved" arc rather than introducing a disconnected new visual for the close.
export const SpeechBubbles: React.FC<{ visual: SpeechBubblesVisual }> = ({ visual }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const indicatorScale = interpolate(frame, [20, 35], [0.4, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => 1 - (1 - t) * (1 - t),
  });

  const bubbleStyle = (highlighted?: boolean): React.CSSProperties => ({
    width: 380,
    padding: '28px 24px',
    borderRadius: 20,
    background: highlighted ? PALETTE.highlight : PALETTE.backgroundShadow,
    border: highlighted ? 'none' : `2px solid ${PALETTE.bodyLine}`,
  });
  const labelStyle = (highlighted?: boolean): React.CSSProperties => ({
    fontFamily: monoFont,
    fontSize: 18,
    color: highlighted ? PALETTE.background : PALETTE.supportingText,
    marginBottom: 10,
    fontWeight: 700,
  });
  const textStyle = (highlighted?: boolean): React.CSSProperties => ({
    fontFamily: monoFont,
    fontSize: 24,
    color: highlighted ? PALETTE.background : PALETTE.paper,
    lineHeight: 1.4,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PALETTE.background,
        justifyContent: 'center',
        alignItems: 'center',
        opacity,
      }}
    >
      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        <div style={bubbleStyle(false)}>
          <div style={labelStyle(false)}>{visual.leftLabel}</div>
          <div style={textStyle(false)}>{visual.leftText}</div>
        </div>
        <div style={bubbleStyle(visual.rightHighlighted)}>
          <div style={labelStyle(visual.rightHighlighted)}>{visual.rightLabel}</div>
          <div style={textStyle(visual.rightHighlighted)}>{visual.rightText}</div>
        </div>
      </div>

      <div style={{ marginTop: 48, transform: `scale(${indicatorScale})` }}>
        {visual.matched ? (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: PALETTE.highlight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 40, color: PALETTE.background, fontWeight: 700 }}>✓</span>
          </div>
        ) : (
          <span style={{ fontFamily: monoFont, fontSize: 22, color: PALETTE.supportingText }}>
            NO MATCH — SCAM CALLER CAN'T KNOW THIS
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
