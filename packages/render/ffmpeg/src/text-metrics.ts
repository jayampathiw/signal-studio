import { openSync } from 'fontkit';

// P3.1 — moved from apps/video/src/longform/text-metrics.js, retyped
// (behavior-preserving mechanical port; see that file's own header comment
// for why real glyph measurement is needed at all — ffmpeg drawtext can't
// tell one filter's rendered width to a sibling filter at runtime).

type OpenedFont = ReturnType<typeof openSync>;
const fontCache = new Map<string, OpenedFont>();

function getFont(fontPath: string): OpenedFont {
  let font = fontCache.get(fontPath);
  if (!font) {
    font = openSync(fontPath);
    fontCache.set(fontPath, font);
  }
  return font;
}

export function measureTextWidth(fontPath: string, fontSize: number, text: string): number {
  if (!text) return 0;
  const font = getFont(fontPath);
  const run = font.layout(text);
  let units = 0;
  for (const glyph of run.glyphs) units += glyph.advanceWidth;
  return (units / font.unitsPerEm) * fontSize;
}

export function measureSegments(fontPath: string, fontSize: number, segments: string[]): number[] {
  return segments.map((text) => measureTextWidth(fontPath, fontSize, text));
}

export function measureTextBox(
  fontPath: string,
  fontSize: number,
  text: string,
): { width: number; height: number } {
  const font = getFont(fontPath);
  const width = measureTextWidth(fontPath, fontSize, text);
  const height = ((font.ascent - font.descent) / font.unitsPerEm) * fontSize;
  return { width, height };
}
