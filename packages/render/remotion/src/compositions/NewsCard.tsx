import { AbsoluteFill, Img, useVideoConfig, interpolate, useCurrentFrame } from 'remotion';

import { resolveAsset } from './resolve-asset';

type Props = {
  headline: string;
  source: string;
  imageUrl: string;
  watermarkUrl: string;
};

// Phase 3 first composition — proves the RenderEngine contract with Remotion.
// Intended for editorial news images with text overlay + watermark.
// TODO: add gradient overlay, Anton font headline, animated entrance.
export const NewsCard: React.FC<Props> = ({ headline, source, imageUrl, watermarkUrl }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', opacity }}>
      {imageUrl && (
        <Img
          src={resolveAsset(imageUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.85) 100%)',
          justifyContent: 'flex-end',
          padding: 40,
        }}
      >
        <p style={{ color: '#fff', fontSize: 48, fontWeight: 900, margin: 0, lineHeight: 1.2 }}>
          {headline}
        </p>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 28, marginTop: 12 }}>📰 {source}</p>
      </AbsoluteFill>
      {watermarkUrl && (
        <Img
          src={resolveAsset(watermarkUrl)}
          style={{ position: 'absolute', bottom: 40, right: 40, width: 120, opacity: 0.7 }}
        />
      )}
    </AbsoluteFill>
  );
};
