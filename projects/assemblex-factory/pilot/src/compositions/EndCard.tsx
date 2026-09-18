import { loadFont } from '@remotion/fonts';
import {
  AbsoluteFill,
  Img,
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
  subject: string;
  disclosure: string;
  pageName: string;
  backgroundStillUrl?: string;
};

const STILL_OPACITY = 0.3;

// 1.5s duration (P0.8-05) — enforced by the caller via totalPostFrames /
// END_CARD_FRAMES in src/props.ts, not by this component.
export const EndCard: React.FC<Props> = ({ subject, disclosure, pageName, backgroundStillUrl }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{ backgroundColor: '#0B0B0F', justifyContent: 'center', alignItems: 'center' }}
    >
      {backgroundStillUrl ? (
        <Img
          src={backgroundStillUrl}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: STILL_OPACITY,
          }}
        />
      ) : null}

      <div style={{ position: 'relative', textAlign: 'center', opacity, padding: '0 64px' }}>
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: 56,
            color: '#FFFFFF',
            margin: '0 0 16px',
          }}
        >
          {subject}
        </p>
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 800,
            fontSize: 36,
            color: 'rgba(255,255,255,0.75)',
            margin: '0 0 24px',
          }}
        >
          {pageName}
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
          {disclosure}
        </p>
      </div>
    </AbsoluteFill>
  );
};
