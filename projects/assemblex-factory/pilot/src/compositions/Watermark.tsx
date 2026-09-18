import { AbsoluteFill } from 'remotion';

type Props = {
  text: string;
};

// Small, top-left, on every frame of the composition (not per-shot) — the
// "AI visualisation" disclosure per refactor-plan.md §10 P0.8-05.
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
