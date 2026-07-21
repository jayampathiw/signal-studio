import { openSync } from 'fontkit';

const fontCache = new Map();

function getFont(fontPath) {
  let font = fontCache.get(fontPath);
  if (!font) {
    font = openSync(fontPath);
    fontCache.set(fontPath, font);
  }
  return font;
}

// Pixel width of `text` at `fontSize` in the given font, measured via real glyph
// advance widths (not a character-count heuristic) — needed because ffmpeg drawtext
// can't tell one filter's rendered width to a sibling filter at runtime.
export function measureTextWidth(fontPath, fontSize, text) {
  if (!text) return 0;
  const font = getFont(fontPath);
  const run = font.layout(text);
  let units = 0;
  for (const glyph of run.glyphs) units += glyph.advanceWidth;
  return (units / font.unitsPerEm) * fontSize;
}

// Measures a list of text segments (e.g. [before, amberWord, after]) at the same
// font/size, returning parallel pixel widths so callers can lay them out contiguously.
export function measureSegments(fontPath, fontSize, segments) {
  return segments.map((text) => measureTextWidth(fontPath, fontSize, text));
}

// Full glyph bounding box (width + real ascent/descent line height) — used to
// size the transparent PNG a Tier 2 word-sync accent is pre-rendered onto
// before its scale-punch animation, so the box isn't clipped or oversized.
export function measureTextBox(fontPath, fontSize, text) {
  const font = getFont(fontPath);
  const width = measureTextWidth(fontPath, fontSize, text);
  const height = ((font.ascent - font.descent) / font.unitsPerEm) * fontSize;
  return { width, height };
}
