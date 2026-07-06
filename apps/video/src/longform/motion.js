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

// Pre-scale canvas: 35% overscan gives room for z up to 1.30 (smash)
const CANVAS_W = 2592; // W * 1.35
const CANVAS_H = 1458; // H * 1.35

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
      const step = (0.12 / D).toFixed(8);
      zpFilter = `zoompan=z='min(pzoom+${step},1.12)':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'micro_push': {
      const step = (0.06 / D).toFixed(8);
      zpFilter = `zoompan=z='min(pzoom+${step},1.06)':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pull': {
      // pzoom can't start above 1.0; use static zoomed-in view as approximation
      zpFilter = `zoompan=z='1.12':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'smash': {
      const step = (0.30 / D).toFixed(8);
      zpFilter = `zoompan=z='min(pzoom+${step},1.30)':x='${cx}':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pan_lr': {
      // Constant z=1.10, pan left→right via px
      const maxX = Math.round(CANVAS_W - CANVAS_W / 1.10); // ~236px
      const step = (maxX / D).toFixed(6);
      zpFilter = `zoompan=z='1.10':x='min(px+${step},${maxX})':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pan_rl': {
      // Constant z=1.10, pan right→left via px (starts from right, moves left)
      const maxX = Math.round(CANVAS_W - CANVAS_W / 1.10); // ~236px
      const step = (maxX / D).toFixed(6);
      zpFilter = `zoompan=z='1.10':x='max(px-${step},0)':y='${cy}':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
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
  return String(t)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}
