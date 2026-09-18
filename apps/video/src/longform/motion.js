// Ken Burns motion engine for 1920×1080 still-image scenes.
// Returns an ffmpeg video filter string for a single still.
//
// Implementation: crop+scale using 'n' (output frame counter) instead of zoompan/pzoom.
// pzoom in zoompan is unreliable on some FFmpeg builds (stays at 1.0 → static frames).
// crop filter's 'n' variable is reliable across all FFmpeg 4.x+ versions.

import { createHash } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { BEBAS_FONT } from './fonts.js';
import { resolvePlacement } from './placement.js';
import { measureSegments } from './text-metrics.js';

// ffmpeg drawtext's inline `text='...'` escaping for embedded single quotes
// (close-quote, escaped-quote, reopen-quote) does not actually render on this
// build (ffmpeg 4.4.2) — the whole filter silently falls back to a default
// font and draws nothing. The short-form reel renderer already works around
// this the same way: write the text to a scratch file and use `textfile=`.
const DRAWTEXT_SCRATCH_DIR = join(tmpdir(), 'signal-studio-drawtext');

function textFilePath(text) {
  if (!existsSync(DRAWTEXT_SCRATCH_DIR)) mkdirSync(DRAWTEXT_SCRATCH_DIR, { recursive: true });
  const hash = createHash('sha1').update(text).digest('hex');
  const filePath = join(DRAWTEXT_SCRATCH_DIR, `${hash}.txt`);
  if (!existsSync(filePath)) writeFileSync(filePath, text, 'utf-8');
  return filePath;
}

export const W = 1920;
export const H = 1080;
export const FPS = 25;

// See zoomChain() below for why this exists — quantizing the zoom's per-frame
// scale target at SS× output resolution (instead of directly at output
// resolution) eliminates visible integer-pixel-rounding judder in slow zooms.
const ZOOM_SUPERSAMPLE = 2;

// Pre-scale canvas: overscan gives room for zoom up to 1.45 with motion
// headroom, at SS× resolution so zoomChain's supersampled scale target never
// has to upscale beyond this canvas even at t=0 (zoomChain requests up to
// fW*SS*1.45). Derived from the frame's own width/height (not fixed
// 1920x1080) so portrait (1080x1920 Shorts) gets the same headroom as
// landscape.
function canvasSize(fW, fH) {
  const factor = 1.5 * ZOOM_SUPERSAMPLE;
  return { canvasW: Math.round(fW * factor), canvasH: Math.round(fH * factor) };
}

function prescale(canvasW, canvasH) {
  return `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${canvasW}:${canvasH}`;
}

// Real per-frame zoom. `crop`'s w/h expressions do NOT re-evaluate per frame
// on this ffmpeg build (4.4.2 has no `eval` option on crop at all — proven
// empirically: a 3x crop-size change over 3s produced pixel-identical frames
// at t=0 and t=3). `scale`, however, DOES support `eval=frame`. So instead of
// shrinking/growing crop's own window, we scale the whole (fixed-size,
// pre-scaled) canvas by the zoom factor z(t) and crop a FIXED fW×fH window
// from its center — as the source grows/shrinks under a constant-size
// window, that reproduces the same zoom effect, but crop's x/y (which DO
// re-evaluate per frame, already relied on by pan_lr/pan_rl) do all the work
// instead of its w/h.
// `cropX` (0..1, default 0.5/center) shifts the horizontal crop window —
// used for Shorts cut from a 16:9 source where the subject isn't centered
// in the frame. 0.5 reproduces the exact center-crop expression used before
// this parameter existed, so default calls are unaffected.
//
// SS (supersample factor, see ZOOM_SUPERSAMPLE above): the previous version
// quantized the zoom's `scale` target directly at output resolution (fW×fH).
// For a slow zoom over a long hold, the per-frame size delta is often well
// under 1 output pixel — most frames round to the identical integer width,
// then a 1-2px jump lands on whichever frame crosses the next integer
// boundary. That uneven hold-then-jump pattern is what reads as judder/
// dragging, not a timing bug (t already increments correctly — verified
// separately). Quantizing at SS× the output size instead, then downscaling
// once at the very end, shrinks each rounding step to 1/SS of a final pixel,
// so the apparent motion is smooth.
function zoomChain(zExpr, fW, fH, cropX = 0.5) {
  const ssW = fW * ZOOM_SUPERSAMPLE;
  const ssH = fH * ZOOM_SUPERSAMPLE;
  const xExpr = cropX === 0.5 ? `(in_w-${ssW})/2` : `(in_w-${ssW})*${cropX}`;
  return [
    `scale=w='${ssW}*(${zExpr})':h='${ssH}*(${zExpr})':eval=frame:flags=lanczos`,
    `crop=w=${ssW}:h=${ssH}:x='${xExpr}':y='(in_h-${ssH})/2'`,
    `scale=${fW}:${fH}:flags=lanczos`,
  ].join(',');
}

/**
 * Build the ffmpeg -vf filter string for a single still cut.
 *
 * @param {object} opts
 * @param {string} opts.motion — push|micro_push|pull|smash|pan_lr|pan_rl|parallax|hold
 * @param {number} opts.durationSec
 * @param {number} [opts.fps]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {string|null} [opts.regrade] — 'warm_amber' | 'cold_blue' | null
 * @param {Array}  [opts.overlays]
 * @param {number} [opts.cropX] — 0..1 horizontal crop-window offset (0.5 = center, default).
 *   Only affects push/pull/smash/micro_push/parallax/hold — used when cutting a
 *   Shorts frame from a 16:9 source whose subject isn't centered.
 * @returns {string} ffmpeg vf filter chain
 */
export function buildMotionFilter({
  motion,
  durationSec,
  fps,
  width,
  height,
  regrade,
  overlays,
  cropX = 0.5,
}) {
  const fW = width ?? W;
  const fH = height ?? H;
  const fFPS = fps ?? FPS;
  const { canvasW, canvasH } = canvasSize(fW, fH);
  const textGeometry = resolveTextGeometry(fW, fH);
  // t = PTS in seconds; always increments for looped stills (unlike n which stays 0)
  const T = durationSec.toFixed(6); // total duration clamp

  let zpFilter;
  let skipPrescale = false;

  switch (motion) {
    // 'static' bypasses the 1.5x overscan+crop every other motion type uses
    // (see prescale()/canvasSize() above) — every other mode, HOLD included,
    // permanently crops away the outer ~33% of the source image. Use this
    // only when the full, uncropped frame must be visible (e.g. an
    // end-screen still with its own baked-in layout that can't tolerate
    // any cropping).
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
      // Constant z=1.20, pan left→right using t
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
      // Constant z=1.20, pan right→left using t
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
      // Static crop — no movement. cropX shifts the window horizontally;
      // default 0.5 reproduces the original always-centered crop exactly.
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

// Text sizing/position differs by orientation: portrait (Shorts) frames are
// narrower, so landscape's lower-third caption band (h*0.80) sits inside the
// platform UI's reserved chrome (captions, follow button, description) — and
// fonts tuned for a 1920-wide frame overflow a 1080-wide one. `landscape`
// values are byte-identical to what this file used before geometry became
// orientation-aware (HERO_FONTSIZE=100, CAPTION_FONTSIZE=80, CAPTION_Y=h*0.80,
// REVEAL_FONTSIZE=64), so 16:9 output is unaffected.
export const TEXT_GEOMETRY = {
  landscape: {
    heroFontsize: 100,
    heroDefaultDur: 3,
    captionFontsize: 80,
    captionY: 'h*0.80',
    revealFontsize: 64,
  },
  // captionFontsize=110 matches the Wave 1 shot lists' karaoke-caption spec
  // ("scaled to ~110px, center-lower third") — larger than a first-pass guess
  // since Shorts captions read at arm's length scroll speed, not seated close.
  portrait: {
    heroFontsize: 72,
    heroDefaultDur: 3,
    captionFontsize: 110,
    captionY: 'h*0.70',
    revealFontsize: 48,
  },
};

function resolveTextGeometry(fW, fH) {
  const base = fH > fW ? TEXT_GEOMETRY.portrait : TEXT_GEOMETRY.landscape;
  return { ...base, frameWidth: fW };
}

/**
 * Build one or more drawtext filters for a timed overlay.
 *
 * Two independent shapes are accepted, dispatched on `format`:
 *  - `format: 'tiered'` (new): Tier 1 hero cards (📝) render as
 *    `buildHeroCard`; Tier 2 (🔤) is now a running caption chunk (see
 *    captions.js) rendered as `buildCaptionAccent` — plain drawtext, no PNG
 *    baking needed, since it's a per-word color swap, not a scale animation.
 *  - anything else (legacy): the original `{at_sec, text, style, font_path}`
 *    shape used by project 29 today — rendered byte-for-byte as before, so
 *    existing data/behavior never changes.
 */
export function buildDrawtext(ov, geometry = TEXT_GEOMETRY.landscape) {
  if (!ov) return null;
  if (ov.format === 'tiered' && ov.tier === 2) {
    if (ov.words?.length) return buildCaptionAccent(ov, geometry);
    return ov.text ? buildStandaloneAccent(ov, geometry) : null;
  }
  if (!ov.text) return null;
  if (ov.format === 'tiered') return buildHeroCard(ov, geometry);
  return buildLegacyDrawtext(ov);
}

function buildLegacyDrawtext({ at_sec, text, style, font_path }) {
  const safe = escapeDrawtext(text);
  const font = font_path ? `:fontfile='${font_path}'` : '';

  const styleMap = {
    small_cream: `fontsize=42:fontcolor=0xFFFAF0:x=(w-text_w)/2:y=h*0.82${font}`,
    lower_third: `fontsize=52:fontcolor=white:x=w*0.07:y=h*0.78${font}:box=1:boxcolor=black@0.5:boxborderw=12`,
    stamp: `fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2${font}:borderw=3:bordercolor=black`,
  };
  const params = styleMap[style] ?? styleMap.small_cream;

  if (at_sec != null) {
    const end_sec = at_sec + 4;
    return `drawtext=text='${safe}':${params}:enable='between(t,${at_sec},${end_sec})'`;
  }
  return `drawtext=text='${safe}':${params}`;
}

// Tier 1 — hero card. Splits `text` into up to 3 segments around `amber_word`
// (cream-before / amber-word / cream-after), each rendered as its own drawtext
// filter, positioned contiguously via pixel widths measured through fontkit
// (ffmpeg drawtext can't measure a sibling filter's rendered text at runtime).
function buildHeroCard({ at_sec, text, amber_word, duration_sec, zone, y, fade_in }, geometry) {
  const dur = duration_sec ?? geometry.heroDefaultDur;
  const placement = resolvePlacement(zone);
  const yPos = y ?? placement.y;
  const fadeIn = fade_in ?? HERO_FADE_IN;

  let segments = [{ text, color: CREAM }];
  if (amber_word) {
    const idx = text.indexOf(amber_word);
    if (idx !== -1) {
      segments = [];
      if (idx > 0) segments.push({ text: text.slice(0, idx), color: CREAM });
      segments.push({ text: amber_word, color: AMBER });
      if (idx + amber_word.length < text.length) {
        segments.push({ text: text.slice(idx + amber_word.length), color: CREAM });
      }
    }
  }

  // Shrink-to-fit safety net (see buildCaptionAccent for the bug this
  // guards against) — hero-card lines from a reused shotlist are normally
  // short punchy beats ("GOAL DISALLOWED"), but nothing enforces that for a
  // Short pulling an unfamiliar scene, so this is defensive, not dead code.
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
  // Substitute the precomputed group width for `text_w` in the anchor's x expression,
  // since no single filter renders the full multi-segment string.
  const x0Expr = placement.x.replace(/text_w/g, totalWidth.toFixed(2));

  // fadeIn <= 0 skips the alpha ramp entirely (no :alpha= param) rather than
  // emitting a (t-at_sec)/0 expression — text just appears instantly at full
  // opacity the moment its enable window opens.
  const alphaExpr =
    at_sec != null && fadeIn > 0
      ? `if(lt(t-${at_sec}\\,${fadeIn})\\,(t-${at_sec})/${fadeIn}\\,1)`
      : null;
  const enableExpr =
    at_sec != null ? `between(t\\,${at_sec}\\,${(at_sec + dur).toFixed(3)})` : null;

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

// Tier 2 — running caption chunk (replaces the old isolated single-word
// punch accent). `words` is a chunk of {text, offset_start, offset_end} from
// captions.js, where offsets are seconds relative to the chunk's OWN at_sec —
// not absolute timestamps. That matters: buildStillsScene remaps a multi-cut
// scene's overlay.at_sec to be relative to each individual cut's own ffmpeg
// timeline (t resets to 0 per generated cut), so an absolute word timestamp
// would silently never match any cut's `t` range. Expressing each word purely
// as an offset from at_sec means it inherits whatever remapping at_sec itself
// already went through, on any timeline. Segments are laid out contiguously
// left-to-right like a hero card's, but here every word gets an always-on
// cream layer plus an amber duplicate `enable`d only during that word's own
// [at_sec+offset_start, at_sec+offset_end] window, so the active word lights
// up amber exactly as it's spoken while the rest of the phrase stays cream.
function buildCaptionAccent({ at_sec, duration_sec, words }, geometry) {
  const start = at_sec;
  const end = at_sec + duration_sec;
  const texts = words.map((w, i) => (i < words.length - 1 ? `${w.text} ` : w.text));

  // Shrink-to-fit: geometry.captionFontsize is a target size, not a
  // guarantee — a long caption chunk at 110px (portrait) can exceed the
  // frame width and overflow both edges (x centers on the full width, so it
  // doesn't just clip one side). Width scales linearly with fontsize, so one
  // measurement at the target size is enough to compute the exact scale
  // factor needed, rather than guessing and re-measuring.
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
  const filters = [];
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
    const wordStart = (start + w.offset_start).toFixed(3);
    const wordEnd = (start + w.offset_end).toFixed(3);
    filters.push(
      `drawtext=${common}:fontcolor=${AMBER}:enable='between(t\\,${wordStart}\\,${wordEnd})'`,
    );
  });

  return filters.join(',');
}

// Tier 2 — standalone reveal. Some scenes' narration ends well before the
// scene itself does (e.g. Scene 1's opening line finishes at ~2.9s of a 12s
// shot) — a deliberate directing choice to let the shot breathe, but it left
// the back half of the scene with nothing on screen once running captions
// (buildCaptionAccent) replaced the old Tier 2 word-flash. This restores a
// single bare accent — the shotlist's own scripted text/timecode/placement,
// independent of speech — as a late visual beat (e.g. Scene 1's "26" popping
// up alone at 0:08). Only used for a scripted Tier 2 line whose timecode
// falls outside every generated caption's window for that scene (see
// assemble-local.mjs's mergeCaptions) — never simultaneous with one.
function buildStandaloneAccent({ at_sec, duration_sec, text, zone }, geometry) {
  const dur = duration_sec ?? 1;
  const end = at_sec + dur;
  const placement = resolvePlacement(zone);
  const file = textFilePath(text);
  const alphaExpr =
    `if(lt(t-${at_sec}\\,${REVEAL_FADE})\\,(t-${at_sec})/${REVEAL_FADE}\\,` +
    `if(lt(t\\,${(end - REVEAL_FADE).toFixed(3)})\\,1\\,max(0\\,(${end.toFixed(3)}-t)/${REVEAL_FADE})))`;
  const enableExpr = `between(t\\,${at_sec}\\,${end.toFixed(3)})`;
  return (
    `drawtext=textfile='${file}':fontfile='${BEBAS_FONT}':fontsize=${geometry.revealFontsize}` +
    `:fontcolor=${AMBER}:x='${placement.x}':y='${placement.y}':borderw=2:bordercolor=black@0.8` +
    `:alpha='${alphaExpr}':enable='${enableExpr}'`
  );
}

function escapeDrawtext(t) {
  // Inside single-quoted FFmpeg filter option, ' must use '\'' (close, escaped, reopen).
  // Actual newline chars → \n (two chars) so FFmpeg drawtext renders line breaks.
  return String(t).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/'/g, "'\\''");
}
