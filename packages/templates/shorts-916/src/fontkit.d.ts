// Ambient declaration for `fontkit`, which has no official types — same
// declaration as packages/render/ffmpeg/src/fontkit.d.ts, duplicated here
// because this package's own tsconfig only includes its own `src/**/*` and
// doesn't pick up that package's ambient .d.ts, even though this package
// transitively imports fontkit-typed code through
// @signal-studio/render-ffmpeg/text-metrics and /motion.
declare module 'fontkit' {
  export type Glyph = { advanceWidth: number };
  export type LayoutRun = { glyphs: Glyph[] };
  export type Font = {
    unitsPerEm: number;
    ascent: number;
    descent: number;
    layout(text: string): LayoutRun;
  };
  export function openSync(path: string): Font;
  const fontkit: { openSync: typeof openSync };
  export default fontkit;
}
