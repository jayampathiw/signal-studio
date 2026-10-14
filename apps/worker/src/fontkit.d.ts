// Ambient shim for `fontkit` (no upstream types) — apps/worker never
// imports it directly, but its tsconfig transitively pulls in
// `@signal-studio/render-ffmpeg`'s source (via the stills-kenburns/
// shorts-916 handlers), and ambient module declarations only apply within
// the tsconfig program that actually includes them. Same duplicate-shim
// treatment `packages/templates/shorts-916/src/fontkit.d.ts` already uses
// for the identical reason.
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
