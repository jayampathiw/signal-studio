import { staticFile } from 'remotion';

// render.ts rewrites local asset paths to be relative to the bundle's publicDir
// (headless Chrome can't load file:// URLs) and leaves remote/data URLs untouched.
// Every composition resolves scene/watermark asset props through this before
// passing them to <Img>/<Audio> so both cases work uniformly.
export function resolveAsset(ref: string | null | undefined): string {
  if (!ref) return '';
  if (/^https?:\/\//i.test(ref) || ref.startsWith('data:')) return ref;
  return staticFile(ref);
}
