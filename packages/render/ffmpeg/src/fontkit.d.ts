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
