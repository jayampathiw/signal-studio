import path from 'node:path';

// P3.1 — moved from apps/video/src/longform/fonts.js, retyped. Fonts are
// copied into this package's own assets/ (packages/render/remotion did the
// same in P2.1) rather than referenced from apps/video, which P3.7 deletes.
export const SERIF_FONT = path.resolve(import.meta.dirname, '../assets/fonts/DejaVuSerif.ttf');
export const BEBAS_FONT = path.resolve(
  import.meta.dirname,
  '../assets/fonts/BebasNeue-Regular.ttf',
);
