import type { PackT } from './manifest';
import type { CompilationProps, PostProps, PostShotProps } from './props';

/**
 * Remotion's `staticFile()` reads `window.remotion_staticBase` to prefix
 * paths with `/public/` — it silently falls back to an *unprefixed* path
 * when `window` is undefined (i.e. called from a plain Node script, which is
 * exactly what `render.ts` is). Since `buildPostProps` needs to run
 * correctly both there and inside the bundled browser composition
 * (`sample-props.ts`), it builds the `/public/...` URL directly instead of
 * relying on staticFile()'s environment-dependent behavior.
 */
function publicFile(path: string): string {
  return '/public/' + path.split('/').map(encodeURIComponent).join('/');
}

function buildShots(pack: PackT, contentBase: string): PostShotProps[] {
  return pack.shots.map((s): PostShotProps => ({
    id: s.id,
    clipUrl: publicFile(`${contentBase}/clips/${s.clip_file}`),
    trimInS: s.trim_in_s,
    speed: s.speed,
    durationS: s.duration_s ?? 0,
    overlayText: s.overlay_text,
    overlayInS: s.overlay_in_s,
    overlayOutS: s.overlay_out_s,
    voiceoverUrl: publicFile(`${contentBase}/${s.voiceover_file ?? ''}`),
    voiceoverDurationS: s.voiceover_duration_s ?? 0,
    igOptional: s.ig_optional,
    keepNativeSfx: s.audio.keep_native_sfx,
  }));
}

/**
 * Builds Post composition props from a validated Pack + the pack's path
 * relative to the public/content root (so the resulting URLs resolve to
 * clips/VO served via the pilot/public/content symlink, or the render
 * script's staged copy).
 */
export function buildPostProps(
  pack: PackT,
  contentBase: string,
  variant: 'fb' | 'ig',
  pageName: string,
): PostProps {
  return {
    shots: buildShots(pack, contentBase),
    variant,
    musicUrl: pack.music.file ? publicFile(`${contentBase}/${pack.music.file}`) : undefined,
    musicGainDb: pack.music.gain_db,
    musicDuck: pack.music.duck,
    endCard: {
      subject: pack.end_card.subject,
      disclosure: pack.end_card.disclosure,
      pageName,
    },
    watermarkText: pack.watermark.text,
  };
}

/**
 * Builds one Compilation episode's shots from a validated Pack. The episode
 * title is the pack's `subject` (there's no dedicated "episode title" field
 * in the Pack schema) — the compilation script decides which episode's
 * music/end card/watermark apply to the whole compilation, since those are
 * series-level concerns Pack doesn't model per-episode.
 */
export function buildEpisodeShots(pack: PackT, contentBase: string): PostShotProps[] {
  return buildShots(pack, contentBase);
}

export function buildCompilationSeriesDefaults(
  pack: PackT,
  contentBase: string,
  pageName: string,
): Pick<CompilationProps, 'musicUrl' | 'musicGainDb' | 'musicDuck' | 'endCard' | 'watermarkText'> {
  return {
    musicUrl: pack.music.file ? publicFile(`${contentBase}/${pack.music.file}`) : undefined,
    musicGainDb: pack.music.gain_db,
    musicDuck: pack.music.duck,
    endCard: {
      subject: pack.end_card.subject,
      disclosure: pack.end_card.disclosure,
      pageName,
    },
    watermarkText: pack.watermark.text,
  };
}
