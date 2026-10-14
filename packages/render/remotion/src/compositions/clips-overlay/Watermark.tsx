import { AbsoluteFill } from 'remotion';

type Props = {
  text: string;
};

// Moved from projects/assemblex-factory/pilot/src/compositions/Watermark.tsx
// (P0.8-05) — unchanged, just re-homed. Top-left, on every frame, per
// timeline.v1's Watermark.position: 'top-left' (added in P2.1 to match this).
export const Watermark: React.FC<Props> = ({ text }) => (
  <AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: 24,
        fontFamily: 'sans-serif',
        fontWeight: 600,
        fontSize: 22,
        color: 'rgba(255,255,255,0.85)',
        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);
