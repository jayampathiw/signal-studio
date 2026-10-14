// P3.1 — moved from apps/video/src/longform/motion.js, retyped
// (behavior-preserving mechanical port; every filter-graph expression below
// is unchanged from the original). Overlay field names are camelCased to
// match `timeline.v1.ts`'s `KenBurnsOverlay`/`KenBurnsCaptionWord` schemas
// (e.g. `at_sec` → `atSec`, `amber_word` → `amberWord`) — the values and
// filter math themselves are untouched.
//
// Ken Burns motion engine for still-image scenes. Returns an ffmpeg video
// filter string for a single still.
//
// Implementation: crop+scale using 't' (PTS in seconds) instead of
// zoompan/pzoom. pzoom in zoompan is unreliable on some FFmpeg builds (stays
// at 1.0 → static frames) — this is also why this package's own pre-P3.1
// `kenburns.js` stub (now replaced) is wrong to use zoompan.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BEBAS_FONT } from './fonts.ts';
import { resolvePlacement } from './placement.ts';
import { measureSegments } from './text-metrics.ts';

// ffmpeg drawtext's inline `text='...'` escaping for embedded single quotes
// (close-quote, escaped-quote, reopen-quote) does not actually render on
// some ffmpeg builds — the whole filter silently falls back to a default
// font and draws nothing. Write the text to a scratch file and use
// `textfile=` instead, same workaround the original file used.
const DRAWTEXT_SCRATCH_DIR = path.join(os.tmpdir(), 'signal-studio-drawtext');

function textFilePath(text: string): string {
  if (!existsSync(DRAWTEXT_SCRATCH_DIR)) mkdirSync(DRAWTEXT_SCRATCH_DIR, { recursive: true });
  const hash = createHash('sha1').update(text).digest('hex');
  const filePath = path.join(DRAWTEXT_SCRATCH_DIR, `${hash}.txt`);
  if (!existsSync(filePath)) writeFileSync(filePath, text, 'utf-8');
  return filePath;
}

export const W = 1920;
export const H = 1080;
export const FPS = 25;

// See zoomChain() below — quantizing the zoom's per-frame scale target at
// SS× output resolution (instead of directly at output resolution)
// eliminates visible integer-pixel-rounding judder in slow zooms.
const ZOOM_SUPERSAMPLE = 2;

function canvasSize(fW: number, fH: number): { canvasW: number; canvasH: number } {
  const factor = 1.5 * ZOOM_SUPERSAMPLE;
  return { canvasW: Math.round(fW * factor), canvasH: Math.round(fH * factor) };
}

function prescale(canvasW: number, canvasH: number): string {
  return `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${canvasW}:${canvasH}`;
}

function zoomChain(zExpr: string, fW: number, fH: number, cropX = 0.5): string {
  const ssW = fW * ZOOM_SUPERSAMPLE;
  const ssH = fH * ZOOM_SUPERSAMPLE;
  const xExpr = cropX === 0.5 ? `(in_w-${ssW})/2` : `(in_w-${ssW})*${cropX}`;
  return [
    `scale=w='${ssW}*(${zExpr})':h='${ssH}*(${zExpr})':eval=frame:flags=lanczos`,
    `crop=w=${ssW}:h=${ssH}:x='${xExpr}':y='(in_h-${ssH})/2'`,
    `scale=${fW}:${fH}:flags=lanczos`,
  ].join(',');
}

export type Motion =
  'push' | 'micro_push' | 'pull' | 'smash' | 'pan_lr' | 'pan_rl' | 'parallax' | 'hold' | 'static';

export type Regrade = 'warm_amber' | 'cold_blue' | null | undefined;

export type LegacyOverlay = {
  format?: undefined;
  at_sec?: number | null;
  text: string;
  style?: 'small_cream' | 'lower_third' | 'stamp';
  font_path?: string;
};

export type TieredHeroOverlay = {
  format: 'tiered';
  tier: 1;
  atSec?: number | null;
  text: string;
  amberWord?: string | null;
  durationSec?: number;
  zone?: string | null;
  fadeIn?: number;
  y?: string;
};

export type TieredCaptionOverlay = {
  format: 'tiered';
  tier: 2;
  atSec: number;
  durationSec: number;
  words: Array<{ text: string; offsetStartSec: number; offsetEndSec: number }>;
};

export type TieredStandaloneOverlay = {
  format: 'tiered';
  tier: 2;
  atSec: number;
  durationSec?: number;
  text: string;
  zone?: string | null;
};

export type Overlay =
  LegacyOverlay | TieredHeroOverlay | TieredCaptionOverlay | TieredStandaloneOverlay;

export function buildMotionFilter(opts: {
  motion: Motion;
  durationSec: number;
  fps?: number;
  width?: number;
  height?: number;
  regrade?: Regrade;
  overlays?: Overlay[];
  cropX?: number;
}): string {
  const { motion, durationSec, regrade, overlays, cropX = 0.5 } = opts;
  const fW = opts.width ?? W;
  const fH = opts.height ?? H;
  const { canvasW, canvasH } = canvasSize(fW, fH);
  const textGeometry = resolveTextGeometry(fW, fH);
  const T = durationSec.toFixed(6);

  let zpFilter: string;
  let skipPrescale = false;

  switch (motion) {
    // 'static' bypasses the 1.5x overscan+crop every other motion type uses
    // — every other mode, HOLD included, permanently crops away the outer
    // ~33% of the source image. Use this only when the full, uncropped
    // frame must be visible.
    case 'static': {
      skipPrescale = true;
      zpFilter = `scale=${fW}:${fH}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${fW}:${fH}:(ow-iw)/2:(oh-ih)/2:color=black`;
      break;
    }
    case 'push':
    case 'parallax': {
      zpFilter = zoomChain(`1+0.22*min(t\\,${T})/${T}`, fW, fH, cropX);
      break;
    }
    case 'micro_push': {
      zpFilter = zoomChain(`1+0.12*min(t\\,${T})/${T}`, fW, fH, cropX);
      break;
    }
    case 'pull': {
      zpFilter = zoomChain(`1.22-0.22*min(t\\,${T})/${T}`, fW, fH, cropX);
      break;
    }
    case 'smash': {
      zpFilter = zoomChain(`1+0.40*min(t\\,${T})/${T}`, fW, fH, cropX);
      break;
    }
    case 'pan_lr': {
      const panW = Math.round(canvasW / 1.2);
      const panH = Math.round(canvasH / 1.2);
      const maxX = canvasW - panW;
      const panCY = Math.round((canvasH - panH) / 2);
      zpFilter = [
        `crop=w=${panW}:h=${panH}:x='${maxX}*min(t\\,${T})/${T}':y=${panCY}`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'pan_rl': {
      const panW = Math.round(canvasW / 1.2);
      const panH = Math.round(canvasH / 1.2);
      const maxX = canvasW - panW;
      const panCY = Math.round((canvasH - panH) / 2);
      zpFilter = [
        `crop=w=${panW}:h=${panH}:x='${maxX}*(1-min(t\\,${T})/${T})':y=${panCY}`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'hold':
    default: {
      const holdX = Math.round((canvasW - fW) * cropX);
      const holdY = Math.round((canvasH - fH) / 2);
      zpFilter = [
        `crop=w=${fW}:h=${fH}:x=${holdX}:y=${holdY}`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
  }

  const parts = skipPrescale ? [zpFilter] : [prescale(canvasW, canvasH), zpFilter];

  if (regrade === 'warm_amber') {
    parts.push(
      'colorbalance=rs=0.1:gs=-0.05:bs=-0.15:rm=0.05:gm=0:bm=-0.1:rh=0.15:gh=0.05:bh=-0.1',
    );
  } else if (regrade === 'cold_blue') {
    parts.push('colorbalance=rs=-0.1:gs=0:bs=0.15:rm=-0.05:gm=0.05:bm=0.1:rh=-0.15:gh=0:bh=0.2');
  }

  parts.push('noise=alls=6:allf=t');
  parts.push('vignette=PI/6');

  if (overlays?.length) {
    for (const ov of overlays) {
      const dt = buildDrawtext(ov, textGeometry);
      if (dt) parts.push(dt);
    }
  }

  parts.push('format=yuv420p');

  return parts.join(',');
}

export const CREAM = '0xf2ece1';
export const AMBER = '0xe8a559';
const HERO_FADE_IN = 0.4;
const CAPTION_FADE_IN = 0.2;
const REVEAL_FADE = 0.15;

type TextGeometry = {
  heroFontsize: number;
  heroDefaultDur: number;
  captionFontsize: number;
  captionY: string;
  revealFontsize: number;
  frameWidth: number;
};

// Text sizing/position differs by orientation: portrait (Shorts) frames are
// narrower, so landscape's lower-third caption band (h*0.80) sits inside
// platform UI's reserved chrome, and fonts tuned for a 1920-wide frame
// overflow a 1080-wide one. `landscape` values are byte-identical to the
// pre-orientation-aware defaults, so 16:9 output is unaffected.
export const TEXT_GEOMETRY: Record<'landscape' | 'portrait', Omit<TextGeometry, 'frameWidth'>> = {
  landscape: {
    heroFontsize: 100,
    heroDefaultDur: 3,
    captionFontsize: 80,
    captionY: 'h*0.80',
    revealFontsize: 64,
  },
  // captionFontsize=110 matches the Wave 1 shot lists' karaoke-caption spec
  // ("scaled to ~110px, center-lower third").
  portrait: {
    heroFontsize: 72,
    heroDefaultDur: 3,
    captionFontsize: 110,
    captionY: 'h*0.70',
    revealFontsize: 48,
  },
};

function resolveTextGeometry(fW: number, fH: number): TextGeometry {
  const base = fH > fW ? TEXT_GEOMETRY.portrait : TEXT_GEOMETRY.landscape;
  return { ...base, frameWidth: fW };
}

export function buildDrawtext(
  ov: Overlay | null | undefined,
  geometry = { ...TEXT_GEOMETRY.landscape, frameWidth: W },
): string | null {
  if (!ov) return null;
  if (ov.format === 'tiered' && ov.tier === 2) {
    if ('words' in ov && ov.words?.length) return buildCaptionAccent(ov, geometry);
    if ('text' in ov && ov.text)
      return buildStandaloneAccent(ov as TieredStandaloneOverlay, geometry);
    return null;
  }
  if (!ov.text) return null;
  if (ov.format === 'tiered') return buildHeroCard(ov as TieredHeroOverlay, geometry);
  return buildLegacyDrawtext(ov as LegacyOverlay);
}

function buildLegacyDrawtext({ at_sec, text, style, font_path }: LegacyOverlay): string {
  const safe = escapeDrawtext(text);
  const font = font_path ? `:fontfile='${font_path}'` : '';

  const styleMap: Record<string, string> = {
    small_cream: `fontsize=42:fontcolor=0xFFFAF0:x=(w-text_w)/2:y=h*0.82${font}`,
    lower_third: `fontsize=52:fontcolor=white:x=w*0.07:y=h*0.78${font}:box=1:boxcolor=black@0.5:boxborderw=12`,
    stamp: `fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2${font}:borderw=3:bordercolor=black`,
  };
  const params = styleMap[style ?? 'small_cream'];

  if (at_sec != null) {
    const end_sec = at_sec + 4;
    return `drawtext=text='${safe}':${params}:enable='between(t,${at_sec},${end_sec})'`;
  }
  return `drawtext=text='${safe}':${params}`;
}

// Tier 1 — hero card. Splits `text` into up to 3 segments around
// `amberWord` (cream-before / amber-word / cream-after), each rendered as
// its own drawtext filter, positioned contiguously via pixel widths
// measured through fontkit (ffmpeg drawtext can't measure a sibling
// filter's rendered text at runtime).
function buildHeroCard(
  { atSec, text, amberWord, durationSec, zone, y, fadeIn }: TieredHeroOverlay,
  geometry: TextGeometry,
): string {
  const dur = durationSec ?? geometry.heroDefaultDur;
  const placement = resolvePlacement(zone);
  const yPos = y ?? placement.y;
  const fadeInVal = fadeIn ?? HERO_FADE_IN;

  let segments: Array<{ text: string; color: string }> = [{ text, color: CREAM }];
  if (amberWord) {
    const idx = text.indexOf(amberWord);
    if (idx !== -1) {
      segments = [];
      if (idx > 0) segments.push({ text: text.slice(0, idx), color: CREAM });
      segments.push({ text: amberWord, color: AMBER });
      if (idx + amberWord.length < text.length) {
        segments.push({ text: text.slice(idx + amberWord.length), color: CREAM });
      }
    }
  }

  // Shrink-to-fit safety net (see buildCaptionAccent for the bug this
  // guards against).
  const MIN_HERO_FONTSIZE = 32;
  let heroFontsize = geometry.heroFontsize;
  let widths = measureSegments(
    BEBAS_FONT,
    heroFontsize,
    segments.map((s) => s.text),
  );
  let totalWidth = widths.reduce((a, b) => a + b, 0);
  const maxHeroWidth = geometry.frameWidth * 0.92;
  if (totalWidth > maxHeroWidth) {
    const scale = maxHeroWidth / totalWidth;
    heroFontsize = Math.max(MIN_HERO_FONTSIZE, Math.floor(heroFontsize * scale));
    const rescale = heroFontsize / geometry.heroFontsize;
    widths = widths.map((w) => w * rescale);
    totalWidth = totalWidth * rescale;
  }
  const x0Expr = placement.x.replace(/text_w/g, totalWidth.toFixed(2));

  const alphaExpr =
    atSec != null && fadeInVal > 0
      ? `if(lt(t-${atSec}\\,${fadeInVal})\\,(t-${atSec})/${fadeInVal}\\,1)`
      : null;
  const enableExpr = atSec != null ? `between(t\\,${atSec}\\,${(atSec + dur).toFixed(3)})` : null;

  let cumulative = 0;
  const filters = segments.map((seg, i) => {
    const file = textFilePath(seg.text);
    const x = i === 0 ? x0Expr : `(${x0Expr})+${cumulative.toFixed(2)}`;
    cumulative += widths[i];
    let params = `textfile='${file}':fontfile='${BEBAS_FONT}':fontsize=${heroFontsize}:fontcolor=${seg.color}:x='${x}':y='${yPos}'`;
    if (alphaExpr) params += `:alpha='${alphaExpr}'`;
    if (enableExpr) params += `:enable='${enableExpr}'`;
    return `drawtext=${params}`;
  });

  return filters.join(',');
}

// Tier 2 — running caption chunk. `words` offsets are seconds relative to
// the chunk's OWN atSec — not absolute timestamps (see the original
// motion.js's header for why that matters for multi-cut scenes).
function buildCaptionAccent(
  { atSec, durationSec, words }: TieredCaptionOverlay,
  geometry: TextGeometry,
): string {
  const start = atSec;
  const end = atSec + durationSec;
  const texts = words.map((w, i) => (i < words.length - 1 ? `${w.text} ` : w.text));

  const MIN_CAPTION_FONTSIZE = 32;
  let widths = measureSegments(BEBAS_FONT, geometry.captionFontsize, texts);
  let totalWidth = widths.reduce((a, b) => a + b, 0);
  let fontsize = geometry.captionFontsize;
  const maxWidth = geometry.frameWidth * 0.92;
  if (totalWidth > maxWidth) {
    const scale = maxWidth / totalWidth;
    fontsize = Math.max(MIN_CAPTION_FONTSIZE, Math.floor(fontsize * scale));
    const rescale = fontsize / geometry.captionFontsize;
    widths = widths.map((w) => w * rescale);
    totalWidth = totalWidth * rescale;
  }
  const x0Expr = `(w-${totalWidth.toFixed(2)})/2`;

  const alphaExpr = `if(lt(t-${start}\\,${CAPTION_FADE_IN})\\,(t-${start})/${CAPTION_FADE_IN}\\,1)`;
  const phraseEnable = `between(t\\,${start}\\,${end.toFixed(3)})`;

  let cumulative = 0;
  const filters: string[] = [];
  words.forEach((w, i) => {
    const file = textFilePath(texts[i]);
    const x = i === 0 ? x0Expr : `(${x0Expr})+${cumulative.toFixed(2)}`;
    cumulative += widths[i];
    const common =
      `textfile='${file}':fontfile='${BEBAS_FONT}':fontsize=${fontsize}` +
      `:x='${x}':y='${geometry.captionY}':borderw=3:bordercolor=black@0.8`;
    filters.push(
      `drawtext=${common}:fontcolor=${CREAM}:alpha='${alphaExpr}':enable='${phraseEnable}'`,
    );
    const wordStart = (start + w.offsetStartSec).toFixed(3);
    const wordEnd = (start + w.offsetEndSec).toFixed(3);
    filters.push(
      `drawtext=${common}:fontcolor=${AMBER}:enable='between(t\\,${wordStart}\\,${wordEnd})'`,
    );
  });

  return filters.join(',');
}

// Tier 2 — standalone reveal. A scripted line whose timecode falls outside
// every generated caption's window for that scene (see this pipeline's
// compile()-time caption-merge logic) — never simultaneous with a running
// caption.
function buildStandaloneAccent(
  { atSec, durationSec, text, zone }: TieredStandaloneOverlay,
  geometry: TextGeometry,
): string {
  const dur = durationSec ?? 1;
  const end = atSec + dur;
  const placement = resolvePlacement(zone);
  const file = textFilePath(text);
  const alphaExpr =
    `if(lt(t-${atSec}\\,${REVEAL_FADE})\\,(t-${atSec})/${REVEAL_FADE}\\,` +
    `if(lt(t\\,${(end - REVEAL_FADE).toFixed(3)})\\,1\\,max(0\\,(${end.toFixed(3)}-t)/${REVEAL_FADE})))`;
  const enableExpr = `between(t\\,${atSec}\\,${end.toFixed(3)})`;
  return (
    `drawtext=textfile='${file}':fontfile='${BEBAS_FONT}':fontsize=${geometry.revealFontsize}` +
    `:fontcolor=${AMBER}:x='${placement.x}':y='${placement.y}':borderw=2:bordercolor=black@0.8` +
    `:alpha='${alphaExpr}':enable='${enableExpr}'`
  );
}

function escapeDrawtext(t: string): string {
  return String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/'/g, "'\\''");
}
