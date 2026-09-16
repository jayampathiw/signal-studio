import { useEffect, useRef, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { PALETTE } from './palette';
import { resolveAsset } from '../resolve-asset';
import type { HighlightBox, ZoomRegion } from '@signal-studio/types/timeline';

type Props = {
  imageUrl: string;
  highlights?: HighlightBox[] | null;
  zoomFrom?: ZoomRegion | null;
  zoomTo?: ZoomRegion | null;
};

const FULL_PAGE: ZoomRegion = { x: 0, y: 0, width: 1, height: 1 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Real documents are almost always portrait (letter/A4), not 16:9 — objectFit:'cover'
// would crop most of the page away and make region coordinates (authored as fractions
// of the whole document) land in the wrong place. So the image is always laid out with
// objectFit:'contain' (whole page visible, letterboxed) and we compute the actual
// displayed image box ourselves from its natural dimensions, so highlight/zoom regions
// line up with the page regardless of its aspect ratio.
function useImageNaturalSize(src: string): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const handleRef = useRef<number | null>(null);

  useEffect(() => {
    if (!src) return;
    setSize(null);
    handleRef.current = delayRender(`loading document image dimensions: ${src}`);
    const img = new window.Image();
    img.onload = () => {
      setSize({ width: img.naturalWidth, height: img.naturalHeight });
      if (handleRef.current !== null) continueRender(handleRef.current);
    };
    img.onerror = () => {
      if (handleRef.current !== null) continueRender(handleRef.current);
    };
    img.src = src;
  }, [src]);

  return size;
}

// Directed Ken-Burns: the camera moves from `zoomFrom` to `zoomTo` (document-page
// fractions) over the scene's duration — a generalization of a plain center push that
// lets a scene push into a specific clause, pan across a paragraph, or pull back out to
// the full page, per the brand's "the document carries the video" identity. Both
// default to the full page (no motion) when omitted. The evidence highlight box (a
// drawn rectangle, not just camera motion) animates in at highlight.fromSec/toSec,
// independent of the camera move.
export const DocumentHighlight: React.FC<Props> = ({ imageUrl, highlights, zoomFrom, zoomTo }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps, width: frameWidth, height: frameHeight } = useVideoConfig();
  const resolvedUrl = resolveAsset(imageUrl);
  const naturalSize = useImageNaturalSize(resolvedUrl);

  const from = zoomFrom ?? FULL_PAGE;
  const to = zoomTo ?? from;
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: 'clamp' });
  const region: ZoomRegion = {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
  };

  // Default bumped from 0.55 — at that opacity the multiply-blended fill read as a
  // washed-out gray/tan wash rather than a solid highlighter mark (review feedback
  // on Video #2: "the color is too light"). 0.8 keeps the underlying text legible
  // (multiply blend, not an opaque fill) while reading as a clearly gold highlight.
  // A scene can carry several sequential highlight beats (each with its own
  // fromSec/toSec) so the evidence box can move — e.g. rate first, then payout — as
  // the narration calls out each figure, instead of being stuck on one spot per scene.
  const highlightsWithOpacity = (highlights ?? []).map((h) => {
    const fromFrame = h.fromSec * fps;
    const toFrame = h.toSec * fps;
    const opacity = interpolate(frame, [fromFrame, Math.max(toFrame, fromFrame + 1)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }) * (h.opacity ?? 0.8);
    return { h, opacity };
  });

  // 'contain' box of naturalSize within the frame (matches objectFit:'contain').
  let page = { left: 0, top: 0, width: frameWidth, height: frameHeight };
  if (naturalSize) {
    const frameAspect = frameWidth / frameHeight;
    const imageAspect = naturalSize.width / naturalSize.height;
    if (imageAspect > frameAspect) {
      const height = frameWidth / imageAspect;
      page = { left: 0, top: (frameHeight - height) / 2, width: frameWidth, height };
    } else {
      const width = frameHeight * imageAspect;
      page = { left: (frameWidth - width) / 2, top: 0, width, height: frameHeight };
    }
  }

  // The pixel rect (in unscaled frame coordinates) the current `region` occupies on
  // the page, then a translate+scale that brings that rect to fill the frame — a
  // "push into this rect" camera move. scale = max(x,y) so the target rect always
  // fully covers the frame (crops overflow rather than leaving letterboxing).
  const rect = {
    left: page.left + region.x * page.width,
    top: page.top + region.y * page.height,
    width: region.width * page.width,
    height: region.height * page.height,
  };
  // min, not max: the target rect should fully come into view (contain-fit into the
  // frame) — for the full-page region this correctly resolves to scale=1 (the plain
  // letterboxed page, no crop). max would crop to fill every pixel, which also
  // crops away the letterbox bars even when there's no intended zoom at all.
  const scale = naturalSize ? Math.min(frameWidth / rect.width, frameHeight / rect.height) : 1;
  const translateX = frameWidth / 2 - (rect.left + rect.width / 2) * scale;
  const translateY = frameHeight / 2 - (rect.top + rect.height / 2) * scale;

  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.background, overflow: 'hidden' }}>
      {/* Single shared transform so the image and the highlight box move in lockstep —
          applying it separately to each would let them drift out of alignment. */}
      <AbsoluteFill style={{ transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`, transformOrigin: '0 0' }}>
        {imageUrl && (
          <Img src={resolvedUrl} style={{ width: frameWidth, height: frameHeight, objectFit: 'contain' }} />
        )}
        {naturalSize && highlightsWithOpacity.map(({ h, opacity }, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: page.left + h.x * page.width,
              top: page.top + h.y * page.height,
              width: h.width * page.width,
              height: h.height * page.height,
              background: PALETTE.highlight,
              opacity,
              mixBlendMode: 'multiply',
              boxShadow: `0 0 0 3px ${PALETTE.highlight}`,
            }}
          />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
