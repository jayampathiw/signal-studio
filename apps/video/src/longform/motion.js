// Ken Burns motion engine for 1920×1080 still-image scenes.
// Returns an ffmpeg video filter string for a single still.
//
// Implementation: crop+scale using 'n' (output frame counter) instead of zoompan/pzoom.
// pzoom in zoompan is unreliable on some FFmpeg builds (stays at 1.0 → static frames).
// crop filter's 'n' variable is reliable across all FFmpeg 4.x+ versions.

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { measureSegments } from './text-metrics.js';
import { resolvePlacement } from './placement.js';
import { BEBAS_FONT } from './fonts.js';

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

// Pre-scale canvas: 50% overscan gives room for zoom up to 1.45 with motion headroom
const CANVAS_W = 2880; // W * 1.50
const CANVAS_H = 1620; // H * 1.50

function prescale() {
  return `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${CANVAS_W}:${CANVAS_H}`;
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
function zoomChain(zExpr, fW, fH) {
  return [
    `scale=w='${fW}*(${zExpr})':h='${fH}*(${zExpr})':eval=frame:flags=lanczos`,
    `crop=w=${fW}:h=${fH}:x='(in_w-${fW})/2':y='(in_h-${fH})/2'`,
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
 * @returns {string} ffmpeg vf filter chain
 */
export function buildMotionFilter({ motion, durationSec, fps, width, height, regrade, overlays }) {
  const fW = width ?? W;
  const fH = height ?? H;
  const fFPS = fps ?? FPS;
  // t = PTS in seconds; always increments for looped stills (unlike n which stays 0)
  const T = durationSec.toFixed(6); // total duration clamp

  let zpFilter;
  let skipPrescale = false;

  switch (motion) {
    // 'static' bypasses the 1.5x overscan+crop every other motion type uses
    // (see prescale()/CANVAS_W/H above) — every other mode, HOLD included,
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
      zpFilter = zoomChain(`1+0.22*min(t\\,${T})/${T}`, fW, fH);
      break;
    }
    case 'micro_push': {
      zpFilter = zoomChain(`1+0.12*min(t\\,${T})/${T}`, fW, fH);
      break;
    }
    case 'pull': {
      zpFilter = zoomChain(`1.22-0.22*min(t\\,${T})/${T}`, fW, fH);
      break;
    }
    case 'smash': {
      zpFilter = zoomChain(`1+0.40*min(t\\,${T})/${T}`, fW, fH);
      break;
    }
    case 'pan_lr': {
      // Constant z=1.20, pan left→right using t
      const panW = Math.round(CANVAS_W / 1.20);
      const panH = Math.round(CANVAS_H / 1.20);
      const maxX = CANVAS_W - panW;
      const panCY = Math.round((CANVAS_H - panH) / 2);
      zpFilter = [
        `crop=w=${panW}:h=${panH}:x='${maxX}*min(t\\,${T})/${T}':y=${panCY}`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'pan_rl': {
      // Constant z=1.20, pan right→left using t
      const panW = Math.round(CANVAS_W / 1.20);
      const panH = Math.round(CANVAS_H / 1.20);
      const maxX = CANVAS_W - panW;
      const panCY = Math.round((CANVAS_H - panH) / 2);
      zpFilter = [
        `crop=w=${panW}:h=${panH}:x='${maxX}*(1-min(t\\,${T})/${T})':y=${panCY}`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'hold':
    default: {
      // Static center crop — no movement
      const holdX = Math.round((CANVAS_W - fW) / 2);
      const holdY = Math.round((CANVAS_H - fH) / 2);
      zpFilter = [
        `crop=w=${fW}:h=${fH}:x=${holdX}:y=${holdY}`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
  }

  const parts = skipPrescale ? [zpFilter] : [prescale(), zpFilter];

  if (regrade === 'warm_amber') {
    parts.push('colorbalance=rs=0.1:gs=-0.05:bs=-0.15:rm=0.05:gm=0:bm=-0.1:rh=0.15:gh=0.05:bh=-0.1');
  } else if (regrade === 'cold_blue') {
    parts.push('colorbalance=rs=-0.1:gs=0:bs=0.15:rm=-0.05:gm=0.05:bm=0.1:rh=-0.15:gh=0:bh=0.2');
  }

  parts.push('noise=alls=6:allf=t');
  parts.push('vignette=PI/6');

  if (overlays?.length) {
    for (const ov of overlays) {
      const dt = buildDrawtext(ov);
      if (dt) parts.push(dt);
    }
  }

  parts.push('format=yuv420p');

  return parts.join(',');
}

export const CREAM = '0xf2ece1';
export const AMBER = '0xe8a559';
const HERO_FONTSIZE = 100;
const HERO_FADE_IN = 0.4;
const HERO_DEFAULT_DUR = 3;
export const CAPTION_FONTSIZE = 80;
const CAPTION_FADE_IN = 0.2;
const CAPTION_Y = 'h*0.80'; // fixed lower-third band — same for every scene, never collides with per-scene subject placement
const REVEAL_FONTSIZE = 64;
const REVEAL_FADE = 0.15;

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
export function buildDrawtext(ov) {
  if (!ov) return null;
  if (ov.format === 'tiered' && ov.tier === 2) {
    if (ov.words?.length) return buildCaptionAccent(ov);
    return ov.text ? buildStandaloneAccent(ov) : null;
  }
  if (!ov.text) return null;
  if (ov.format === 'tiered') return buildHeroCard(ov);
  return buildLegacyDrawtext(ov);
}

function buildLegacyDrawtext({ at_sec, text, style, font_path }) {
  const safe = escapeDrawtext(text);
  const font = font_path ? `:fontfile='${font_path}'` : '';

  const styleMap = {
    small_cream: `fontsize=42:fontcolor=0xFFFAF0:x=(w-text_w)/2:y=h*0.82${font}`,
    lower_third: `fontsize=52:fontcolor=white:x=w*0.07:y=h*0.78${font}:box=1:boxcolor=black@0.5:boxborderw=12`,
    stamp:       `fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2${font}:borderw=3:bordercolor=black`,
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
function buildHeroCard({ at_sec, text, amber_word, duration_sec, zone }) {
  const dur = duration_sec ?? HERO_DEFAULT_DUR;
  const placement = resolvePlacement(zone);

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

  const widths = measureSegments(BEBAS_FONT, HERO_FONTSIZE, segments.map((s) => s.text));
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  // Substitute the precomputed group width for `text_w` in the anchor's x expression,
  // since no single filter renders the full multi-segment string.
  const x0Expr = placement.x.replace(/text_w/g, totalWidth.toFixed(2));

  const alphaExpr = at_sec != null
    ? `if(lt(t-${at_sec}\\,${HERO_FADE_IN})\\,(t-${at_sec})/${HERO_FADE_IN}\\,1)`
    : null;
  const enableExpr = at_sec != null
    ? `between(t\\,${at_sec}\\,${(at_sec + dur).toFixed(3)})`
    : null;

  let cumulative = 0;
  const filters = segments.map((seg, i) => {
    const file = textFilePath(seg.text);
    const x = i === 0 ? x0Expr : `(${x0Expr})+${cumulative.toFixed(2)}`;
    cumulative += widths[i];
    let params = `textfile='${file}':fontfile='${BEBAS_FONT}':fontsize=${HERO_FONTSIZE}:fontcolor=${seg.color}:x='${x}':y='${placement.y}'`;
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
function buildCaptionAccent({ at_sec, duration_sec, words }) {
  const start = at_sec;
  const end = at_sec + duration_sec;
  const texts = words.map((w, i) => (i < words.length - 1 ? `${w.text} ` : w.text));
  const widths = measureSegments(BEBAS_FONT, CAPTION_FONTSIZE, texts);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  const x0Expr = `(w-${totalWidth.toFixed(2)})/2`;

  const alphaExpr = `if(lt(t-${start}\\,${CAPTION_FADE_IN})\\,(t-${start})/${CAPTION_FADE_IN}\\,1)`;
  const phraseEnable = `between(t\\,${start}\\,${end.toFixed(3)})`;

  let cumulative = 0;
  const filters = [];
  words.forEach((w, i) => {
    const file = textFilePath(texts[i]);
    const x = i === 0 ? x0Expr : `(${x0Expr})+${cumulative.toFixed(2)}`;
    cumulative += widths[i];
    const common = `textfile='${file}':fontfile='${BEBAS_FONT}':fontsize=${CAPTION_FONTSIZE}` +
      `:x='${x}':y='${CAPTION_Y}':borderw=3:bordercolor=black@0.8`;
    filters.push(`drawtext=${common}:fontcolor=${CREAM}:alpha='${alphaExpr}':enable='${phraseEnable}'`);
    const wordStart = (start + w.offset_start).toFixed(3);
    const wordEnd = (start + w.offset_end).toFixed(3);
    filters.push(`drawtext=${common}:fontcolor=${AMBER}:enable='between(t\\,${wordStart}\\,${wordEnd})'`);
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
function buildStandaloneAccent({ at_sec, duration_sec, text, zone }) {
  const dur = duration_sec ?? 1;
  const end = at_sec + dur;
  const placement = resolvePlacement(zone);
  const file = textFilePath(text);
  const alphaExpr =
    `if(lt(t-${at_sec}\\,${REVEAL_FADE})\\,(t-${at_sec})/${REVEAL_FADE}\\,` +
    `if(lt(t\\,${(end - REVEAL_FADE).toFixed(3)})\\,1\\,max(0\\,(${end.toFixed(3)}-t)/${REVEAL_FADE})))`;
  const enableExpr = `between(t\\,${at_sec}\\,${end.toFixed(3)})`;
  return `drawtext=textfile='${file}':fontfile='${BEBAS_FONT}':fontsize=${REVEAL_FONTSIZE}` +
    `:fontcolor=${AMBER}:x='${placement.x}':y='${placement.y}':borderw=2:bordercolor=black@0.8` +
    `:alpha='${alphaExpr}':enable='${enableExpr}'`;
}

function escapeDrawtext(t) {
  // Inside single-quoted FFmpeg filter option, ' must use '\'' (close, escaped, reopen).
  // Actual newline chars → \n (two chars) so FFmpeg drawtext renders line breaks.
  return String(t)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/'/g, "'\\''");
}
