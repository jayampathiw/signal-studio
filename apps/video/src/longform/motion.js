// Ken Burns motion engine for 1920×1080 still-image scenes.
// Returns an ffmpeg video filter string for a single still.
//
// FFmpeg zoompan constraints (6.x and 4.x):
//  - Input must be >= output size; pre-scale to CANVAS_W×CANVAS_H first
//  - z expression: only 'pzoom' (prev frame zoom) is reliable — 'n' is not available
//  - x/y expressions: use 'zoom' (current zoom) and 'px/py' (prev position) — NOT 'z'
//  - if(), lt() etc. cause parse errors in z expressions on these FFmpeg builds

export const W = 1920;
export const H = 1080;
export const FPS = 25;

// Pre-scale canvas: 50% overscan gives room for z up to 1.45 with visible motion headroom
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
  const D = Math.max(1, Math.round(durationSec * fFPS));

  const cx = `(iw-iw/zoom)/2`; // centered x using current zoom
  const cy = `(ih-ih/zoom)/2`; // centered y using current zoom

  let zpFilter;

  switch (motion) {
    case 'push':
    case 'parallax': {
      // 0% → 22% zoom — clearly visible Ken Burns push
      const step = (0.22 / D).toFixed(8);
      zpFilter = `zoompan=z='min(pzoom+${step},1.22)':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'micro_push': {
      // 0% → 12% zoom — subtle push for tight shots
      const step = (0.12 / D).toFixed(8);
      zpFilter = `zoompan=z='min(pzoom+${step},1.12)':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pull': {
      // Approximate pull: start zoomed in at 1.22, hold (true reverse not possible with pzoom)
      zpFilter = `zoompan=z='1.22':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'smash': {
      // 0% → 40% fast push — impact zoom
      const step = (0.40 / D).toFixed(8);
      zpFilter = `zoompan=z='min(pzoom+${step},1.40)':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pan_lr': {
      // Constant z=1.20, pan left→right via px
      const maxX = Math.round(CANVAS_W - CANVAS_W / 1.20);
      const step = (maxX / D).toFixed(6);
      zpFilter = `zoompan=z='1.20':x='min(px+${step},${maxX})':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pan_rl': {
      // Constant z=1.20, pan right→left via px
      const maxX = Math.round(CANVAS_W - CANVAS_W / 1.20);
      const step = (maxX / D).toFixed(6);
      zpFilter = `zoompan=z='1.20':x='max(px-${step},0)':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'hold':
    default: {
      zpFilter = `zoompan=z='1.00':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
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
