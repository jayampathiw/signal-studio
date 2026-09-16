import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { PALETTE } from '../palette';

// Simple animated audio-waveform bars, overlaid on the smartphone-screen B-roll to
// visualize "a voice being processed" without needing real audio-reactive analysis —
// a seeded pseudo-random per-bar animation reads as a waveform at a glance.
const BAR_COUNT = 28;
const seeds = Array.from({ length: BAR_COUNT }, (_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1);

export const WaveformOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 160 }}>
        {seeds.map((seed, i) => {
          const phase = frame / 6 + seed * 10;
          const h = 20 + (Math.abs(Math.sin(phase)) * 0.6 + Math.abs(seed)) * 130;
          return (
            <div
              key={i}
              style={{
                width: 6,
                height: Math.min(h, 160),
                background: PALETTE.highlight,
                borderRadius: 3,
              }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
