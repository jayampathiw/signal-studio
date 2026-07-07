// Ken Burns motion engine for 1920×1080 still-image scenes.
// Returns an ffmpeg video filter string for a single still.
//
// Implementation: crop+scale using 'n' (output frame counter) instead of zoompan/pzoom.
// pzoom in zoompan is unreliable on some FFmpeg builds (stays at 1.0 → static frames).
// crop filter's 'n' variable is reliable across all FFmpeg 4.x+ versions.

export const W = 1920;
export const H = 1080;
export const FPS = 25;

// Pre-scale canvas: 50% overscan gives room for zoom up to 1.45 with motion headroom
const CANVAS_W = 2880; // W * 1.50
const CANVAS_H = 1620; // H * 1.50

function prescale() {
  return `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${CANVAS_W}:${CANVAS_H}`;
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
  const D = Math.max(2, Math.round(durationSec * fFPS));
  const Dm1 = D - 1; // last frame index — zoom is at max at frame Dm1

  let zpFilter;

  switch (motion) {
    case 'push':
    case 'parallax': {
      // Zoom 1.0 → 1.22 over D frames (22% Ken Burns push-in)
      zpFilter = [
        `crop=w='iw/(1+0.22*min(n,${Dm1})/${Dm1})'` +
        `:h='ih/(1+0.22*min(n,${Dm1})/${Dm1})'` +
        `:x='(iw-iw/(1+0.22*min(n,${Dm1})/${Dm1}))/2'` +
        `:y='(ih-ih/(1+0.22*min(n,${Dm1})/${Dm1}))/2'`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'micro_push': {
      // Zoom 1.0 → 1.12 (subtle push for tight shots)
      zpFilter = [
        `crop=w='iw/(1+0.12*min(n,${Dm1})/${Dm1})'` +
        `:h='ih/(1+0.12*min(n,${Dm1})/${Dm1})'` +
        `:x='(iw-iw/(1+0.12*min(n,${Dm1})/${Dm1}))/2'` +
        `:y='(ih-ih/(1+0.12*min(n,${Dm1})/${Dm1}))/2'`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'pull': {
      // Zoom 1.22 → 1.0 (start close, pull back)
      zpFilter = [
        `crop=w='iw/(1.22-0.22*min(n,${Dm1})/${Dm1})'` +
        `:h='ih/(1.22-0.22*min(n,${Dm1})/${Dm1})'` +
        `:x='(iw-iw/(1.22-0.22*min(n,${Dm1})/${Dm1}))/2'` +
        `:y='(ih-ih/(1.22-0.22*min(n,${Dm1})/${Dm1}))/2'`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'smash': {
      // Zoom 1.0 → 1.40 fast push — impact zoom
      zpFilter = [
        `crop=w='iw/(1+0.40*min(n,${Dm1})/${Dm1})'` +
        `:h='ih/(1+0.40*min(n,${Dm1})/${Dm1})'` +
        `:x='(iw-iw/(1+0.40*min(n,${Dm1})/${Dm1}))/2'` +
        `:y='(ih-ih/(1+0.40*min(n,${Dm1})/${Dm1}))/2'`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'pan_lr': {
      // Constant z=1.20, pan left→right
      const panW = Math.round(CANVAS_W / 1.20);
      const panH = Math.round(CANVAS_H / 1.20);
      const maxX = CANVAS_W - panW;
      const panCY = Math.round((CANVAS_H - panH) / 2);
      zpFilter = [
        `crop=w=${panW}:h=${panH}:x='${maxX}*min(n,${Dm1})/${Dm1}':y=${panCY}`,
        `scale=${fW}:${fH}:flags=lanczos`,
      ].join(',');
      break;
    }
    case 'pan_rl': {
      // Constant z=1.20, pan right→left
      const panW = Math.round(CANVAS_W / 1.20);
      const panH = Math.round(CANVAS_H / 1.20);
      const maxX = CANVAS_W - panW;
      const panCY = Math.round((CANVAS_H - panH) / 2);
      zpFilter = [
        `crop=w=${panW}:h=${panH}:x='${maxX}*(1-min(n,${Dm1})/${Dm1})':y=${panCY}`,
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

  const parts = [prescale(), zpFilter];

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

/**
 * Build a drawtext filter for a timed overlay.
 * Styles: small_cream | lower_third | stamp
 */
export function buildDrawtext({ at_sec, text, style, font_path }) {
  if (!text) return null;
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

function escapeDrawtext(t) {
  // Inside single-quoted FFmpeg filter option, ' must use '\'' (close, escaped, reopen).
  // Actual newline chars → \n (two chars) so FFmpeg drawtext renders line breaks.
  return String(t)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/'/g, "'\\''");
}
