import { loadFont } from '@remotion/fonts';
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FONT_FAMILY = 'Inter';

// staticFile('fonts/Inter-ExtraBold.ttf') resolves against whatever
// render.ts sets as the bundle's publicDir for this render — render.ts
// always copies packages/render/remotion/assets/fonts/Inter-ExtraBold.ttf
// there unconditionally (not just timeline-referenced assets), since a
// font isn't something a Timeline references by path.
const waitForFont = delayRender('Loading Inter (800) for FactOverlay');
loadFont({
  family: FONT_FAMILY,
  url: staticFile('fonts/Inter-ExtraBold.ttf'),
  weight: '800',
})
  .then(() => continueRender(waitForFont))
  .catch((err) => {
    console.error('FactOverlay: failed to load Inter font', err);
    continueRender(waitForFont);
  });

type Props = {
  text: string;
  /** Local-to-shot-Sequence frame the overlay fades in at. */
  inFrame: number;
  /** Local-to-shot-Sequence frame the overlay fades out by. */
  outFrame: number;
};

const FADE_IN_FRAMES = 8;
const RISE_PX = 20;
const FADE_OUT_FRAMES = 6;
const BASELINE_FRACTION = 0.72;
const BOX_WIDTH_FRACTION = 0.84;
const MAX_FONT_SIZE = 72;
const MIN_FONT_SIZE = 64;
const MAX_LINES = 2;

// Character-width heuristic, same factor used by the engine's CaptionLayer —
// avoids a canvas measureText round-trip for a two-tier size choice.
function estimatedLines(text: string, fontSizePx: number, maxWidthPx: number): number {
  const avgCharWidth = fontSizePx * 0.56;
  const charsPerLine = Math.max(8, Math.floor(maxWidthPx / avgCharWidth));
  return Math.ceil(text.length / charsPerLine);
}

// Moved from projects/assemblex-factory/pilot/src/compositions/FactOverlay.tsx
// (P0.8-05) — unchanged besides the header comment above.
export const FactOverlay: React.FC<Props> = ({ text, inFrame, outFrame }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  if (frame < inFrame || frame > outFrame) return null;

  const fadeIn = interpolate(frame, [inFrame, inFrame + FADE_IN_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rise = interpolate(frame, [inFrame, inFrame + FADE_IN_FRAMES], [RISE_PX, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(frame, [outFrame - FADE_OUT_FRAMES, outFrame], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const boxWidthPx = width * BOX_WIDTH_FRACTION - 64; // minus horizontal padding
  let fontSize = MAX_FONT_SIZE;
  let lines = estimatedLines(text, fontSize, boxWidthPx);
  if (lines > MAX_LINES) {
    fontSize = MIN_FONT_SIZE;
    lines = estimatedLines(text, fontSize, boxWidthPx);
    if (lines > MAX_LINES) {
      console.error(
        `FactOverlay: "${text}" still exceeds ${MAX_LINES} lines at ${MIN_FONT_SIZE}px (est. ${lines} lines) — clamping visually.`,
      );
    }
  }

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: height * BASELINE_FRACTION,
          left: (width * (1 - BOX_WIDTH_FRACTION)) / 2,
          width: width * BOX_WIDTH_FRACTION,
          transform: `translateY(calc(-100% + ${rise}px))`,
          opacity,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: 'rgba(0,0,0,0.6)',
            borderRadius: 16,
            padding: '20px 32px',
            maxWidth: '100%',
          }}
        >
          <p
            style={{
              fontFamily: FONT_FAMILY,
              fontWeight: 800,
              fontSize,
              lineHeight: 1.25,
              color: '#FFFFFF',
              textAlign: 'center',
              margin: 0,
              display: '-webkit-box',
              WebkitLineClamp: MAX_LINES,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {text}
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
