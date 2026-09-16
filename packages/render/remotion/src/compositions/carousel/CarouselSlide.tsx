import { AbsoluteFill, Img } from 'remotion';
import { loadFont as loadPTSerif } from '@remotion/google-fonts/PTSerif';
import { loadFont as loadCourierPrime } from '@remotion/google-fonts/CourierPrime';
import { PALETTE } from '../case-file/palette';
import { resolveAsset } from '../resolve-asset';

const { fontFamily: serifFont } = loadPTSerif();
const { fontFamily: monoFont } = loadCourierPrime();

export type CarouselSlideProps = {
  slideNumber: number;
  totalSlides: number;
  headline: string;
  body?: string;
  watermarkUrl?: string;
  showFolder?: boolean; // brand motif for the hook/CTA slides (1 and last)
};

// A single static carousel slide (Facebook/Instagram feed, 4:5). No animation —
// renderStill() captures frame 0, so this deliberately doesn't rely on
// useCurrentFrame() interpolation the way the video compositions do.
export const CarouselSlide: React.FC<CarouselSlideProps> = ({
  slideNumber,
  totalSlides,
  headline,
  body,
  watermarkUrl,
  showFolder,
}) => (
  <AbsoluteFill style={{ backgroundColor: PALETTE.background, padding: 80, boxSizing: 'border-box' }}>
    <p style={{ fontFamily: monoFont, fontSize: 22, color: PALETTE.taglineGold, letterSpacing: 2, margin: 0 }}>
      STEP {slideNumber} OF {totalSlides}
    </p>

    {showFolder && (
      <div style={{ position: 'relative', width: 220, height: 220, margin: '40px 0' }}>
        <div style={{ position: 'absolute', left: 36, top: 42, width: 36, height: 86, background: PALETTE.backgroundShadow }} />
        <div style={{ position: 'absolute', right: 36, top: 42, width: 36, height: 86, background: PALETTE.backgroundShadow }} />
        <div style={{
          position: 'absolute', left: 55, top: 25, width: 110, height: 98, background: PALETTE.paper,
          padding: 10, boxSizing: 'border-box',
        }}>
          <div style={{ width: '85%', height: 6, background: PALETTE.bodyLine, marginBottom: 6 }} />
          <div style={{ width: '65%', height: 6, background: PALETTE.bodyLine, marginBottom: 6 }} />
          <div style={{ width: '75%', height: 8, background: PALETTE.highlight }} />
        </div>
        <div style={{
          position: 'absolute', left: 24, top: 92, width: 172, height: 80,
          background: `linear-gradient(180deg, ${PALETTE.folderTanTop}, ${PALETTE.folderTanBottom})`,
          clipPath: 'polygon(6% 0%, 94% 0%, 100% 100%, 0% 100%)',
        }} />
      </div>
    )}

    <AbsoluteFill style={{ justifyContent: 'center', paddingBottom: 100 }}>
      <p style={{
        fontFamily: serifFont, fontWeight: 700, fontSize: 64, color: PALETTE.paper,
        lineHeight: 1.15, margin: 0, maxWidth: 880,
      }}>
        {headline}
      </p>
      {body && (
        <p style={{
          fontFamily: monoFont, fontSize: 30, color: PALETTE.supportingText,
          lineHeight: 1.5, marginTop: 32, maxWidth: 820,
        }}>
          {body}
        </p>
      )}
    </AbsoluteFill>

    {watermarkUrl && (
      <Img
        src={resolveAsset(watermarkUrl)}
        style={{ position: 'absolute', bottom: 48, right: 48, width: 140, opacity: 0.9 }}
      />
    )}
  </AbsoluteFill>
);
