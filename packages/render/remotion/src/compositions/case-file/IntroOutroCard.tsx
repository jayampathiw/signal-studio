import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { loadFont as loadPTSerif } from '@remotion/google-fonts/PTSerif';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { PALETTE, TAGLINE } from './palette';

const { fontFamily: serifFont } = loadPTSerif();
const { fontFamily: monoFont } = loadCourierPrime();

type Props = {
  wordmark?: string;
};

// The Policy File's locked visual identity (brand doc §3): a manila folder with a
// real document, one line highlighted — "the evidence, found and flagged." The
// document must peek ABOVE the folder's front flap with the highlight in that
// exposed area — positioning it lower (behind the flap) hides it entirely, per the
// brand doc's own production note from asset creation.
export const IntroOutroCard: React.FC<Props> = ({ wordmark = 'THE POLICY FILE' }) => {
  const frame = useCurrentFrame();

  // The outro is 75 frames (CaseFile.tsx's OUTRO_FRAMES): the wordmark and
  // tagline must be fully in by frame 24 so they read for ~1.7 s — at 45–65
  // they were on screen for a third of a second (Lokken legibility review).
  const foldEnter = interpolate(frame, [0, 12], [40, 0], { extrapolateRight: 'clamp' });
  const docOpacity = interpolate(frame, [4, 16], [0, 1], { extrapolateRight: 'clamp' });
  const highlightOpacity = interpolate(frame, [16, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const textOpacity = interpolate(frame, [12, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PALETTE.background,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 360,
          height: 360,
          transform: `translateY(${foldEnter}px)`,
        }}
      >
        {/* Back tab */}
        <div
          style={{
            position: 'absolute',
            left: 60,
            top: 70,
            width: 60,
            height: 140,
            background: PALETTE.backgroundShadow,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 60,
            top: 70,
            width: 60,
            height: 140,
            background: PALETTE.backgroundShadow,
          }}
        />

        {/* Document, peeking above the folder flap */}
        <div
          style={{
            position: 'absolute',
            left: 90,
            top: 40,
            width: 180,
            height: 160,
            background: PALETTE.paper,
            opacity: docOpacity,
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{ width: '85%', height: 10, background: PALETTE.bodyLine, marginBottom: 10 }}
          />
          <div
            style={{ width: '65%', height: 10, background: PALETTE.bodyLine, marginBottom: 10 }}
          />
          <div
            style={{
              width: '75%',
              height: 12,
              background: PALETTE.highlight,
              opacity: highlightOpacity,
            }}
          />
        </div>

        {/* Folder body (gradient trapezoid) */}
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 150,
            width: 280,
            height: 130,
            background: `linear-gradient(180deg, ${PALETTE.folderTanTop}, ${PALETTE.folderTanBottom})`,
            clipPath: 'polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)',
          }}
        />
      </div>

      <p
        style={{
          fontFamily: serifFont,
          fontWeight: 700,
          fontSize: 64,
          color: PALETTE.paper,
          margin: '32px 0 8px',
          opacity: textOpacity,
        }}
      >
        {wordmark}
      </p>
      <p
        style={{
          fontFamily: monoFont,
          fontSize: 32,
          color: PALETTE.taglineGold,
          letterSpacing: 2,
          opacity: textOpacity,
        }}
      >
        {TAGLINE}
      </p>
    </AbsoluteFill>
  );
};
