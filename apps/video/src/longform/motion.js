// Ken Burns motion engine for 1920×1080 still-image scenes.
// Returns an ffmpeg video filter string for a single still at given fps/duration/size.
// All zoom values are clamped to: push ≤1.15, micro_push ≤1.06, smash ≤1.30.
//
// Ease-in-out formula (quadratic):
//   t = n/D   (n = frame number 0-based, D = total frames)
//   ease(t) = t<0.5 ? 2t² : 1-(−2t+2)²/2
// Expressed in ffmpeg's eval: if(lt(n/D,0.5), 2*pow(n/D,2), 1-pow(-2*(n/D)+2,2)/2)

export const W = 1920;
export const H = 1080;
export const FPS = 25;

function easeExpr(n_var, D) {
  // Quadratic ease-in-out for normalized t = n_var / D
  return `if(lt(${n_var}/${D},0.5),2*pow(${n_var}/${D},2),1-pow(-2*(${n_var}/${D})+2,2)/2)`;
}

/**
 * Build the ffmpeg -vf filter string for a single still cut.
 *
 * @param {object} opts
 * @param {string} opts.motion — one of push|micro_push|pull|smash|pan_lr|pan_rl|parallax|hold
 * @param {number} opts.durationSec — scene duration in seconds
 * @param {number} [opts.fps] — defaults to FPS (25)
 * @param {number} [opts.width] — defaults to W (1920)
 * @param {number} [opts.height] — defaults to H (1080)
 * @param {string|null} [opts.regrade] — 'warm_amber' | 'cold_blue' | null
 * @param {Array}  [opts.overlays] — [{at_sec, text, style}] timed text overlays
 * @returns {string} ffmpeg vf filter chain
 */
export function buildMotionFilter({ motion, durationSec, fps, width, height, regrade, overlays }) {
  const fW = width ?? W;
  const fH = height ?? H;
  const fFPS = fps ?? FPS;
  const D = Math.max(1, Math.round(durationSec * fFPS));

  let zpFilter;

  switch (motion) {
    case 'push': {
      const z0 = 1.00, z1 = 1.12;
      const ease = easeExpr('n', D);
      zpFilter = `zoompan=z='${z0}+(${z1 - z0})*${ease}':x='(iw-iw/z)/2':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'micro_push': {
      const z0 = 1.00, z1 = 1.06;
      const ease = easeExpr('n', D);
      zpFilter = `zoompan=z='${z0}+(${z1 - z0})*${ease}':x='(iw-iw/z)/2':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pull': {
      const z0 = 1.15, z1 = 1.00;
      const ease = easeExpr('n', D);
      zpFilter = `zoompan=z='${z0}+(${z1 - z0})*${ease}':x='(iw-iw/z)/2':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'smash': {
      // 1.00 → 1.30 in 1.5s, then hold
      const smashFrames = Math.min(Math.round(1.5 * fFPS), D);
      zpFilter = `zoompan=z='if(lt(n,${smashFrames}),1.00+0.30*(n/${smashFrames}),1.30)':x='(iw-iw/z)/2':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pan_lr': {
      // Pan left→right at constant z=1.10
      zpFilter = `zoompan=z='1.10':x='(iw-iw/z)*n/${D}':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'pan_rl': {
      // Pan right→left at constant z=1.10
      zpFilter = `zoompan=z='1.10':x='(iw-iw/z)*(1-n/${D})':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'parallax': {
      // Approximated as push until true parallax compositing is implemented
      const z0 = 1.00, z1 = 1.12;
      const ease = easeExpr('n', D);
      zpFilter = `zoompan=z='${z0}+(${z1 - z0})*${ease}':x='(iw-iw/z)/2':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
    case 'hold':
    default: {
      zpFilter = `zoompan=z='1.00':x='(iw-iw/z)/2':y='(ih-ih/z)/2':d=${D}:s=${fW}x${fH}:fps=${fFPS}`;
      break;
    }
  }

  const parts = [zpFilter];

  // Colour regrade (warm↔cold narrative punctuation)
  if (regrade === 'warm_amber') {
    // Push shadows toward orange-amber, lift highlights warm
    parts.push('colorbalance=rs=0.1:gs=-0.05:bs=-0.15:rm=0.05:gm=0:bm=-0.1:rh=0.15:gh=0.05:bh=-0.1');
  } else if (regrade === 'cold_blue') {
    // Push toward cold steel-blue
    parts.push('colorbalance=rs=-0.1:gs=0:bs=0.15:rm=-0.05:gm=0.05:bm=0.1:rh=-0.15:gh=0:bh=0.2');
  }

  // Grain: subtle film grain on all stills (unifies disparate generations)
  parts.push('noise=alls=6:allf=t');

  // Vignette: dark edge falloff
  parts.push('vignette=PI/6');

  // Timed text overlays
  if (overlays?.length) {
    for (const ov of overlays) {
      const dt = buildDrawtext(ov);
      if (dt) parts.push(dt);
    }
  }

  // Ensure correct pixel format for concat compatibility
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
