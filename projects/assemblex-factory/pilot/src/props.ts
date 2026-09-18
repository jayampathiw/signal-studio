/**
 * Props shape for the `Post` composition (P0.8-05). These are what the
 * `render` script (P0.8-06) builds from a validated `Pack` + resolved asset
 * paths — the composition itself never reads pack.json directly.
 */

export type PostShotProps = {
  id: string;
  /** staticFile()-resolved path to the normalised clip (clips/<file>, post-prep). */
  clipUrl: string;
  trimInS: number;
  speed: number;
  /** Normalised clip duration (post-prep), seconds — from prep's ffprobe measurement. */
  durationS: number;
  overlayText: string;
  overlayInS: number;
  overlayOutS: number;
  /** staticFile()-resolved path to the loudnorm'd VO (vo/<id>_vo_n.wav). */
  voiceoverUrl: string;
  /** Measured VO duration (post-loudnorm), seconds — needed for the music-duck window. */
  voiceoverDurationS: number;
  igOptional: boolean;
  keepNativeSfx: boolean;
};

export type PostProps = {
  shots: PostShotProps[];
  /** Which output this render is for — `ig` drops shots with igOptional=true. */
  variant: 'fb' | 'ig';
  musicUrl?: string;
  musicGainDb: number;
  musicDuck: boolean;
  endCard: {
    subject: string;
    disclosure: string;
    /** Brand/page name — not in the Pack schema; comes from project.yaml. Placeholder until wired up. */
    pageName: string;
    /** staticFile()-resolved path to the last still, shown at 30% opacity behind the end card. */
    backgroundStillUrl?: string;
  };
  watermarkText: string;
};

export function visibleShots(props: Pick<PostProps, 'shots' | 'variant'>): PostShotProps[] {
  return props.variant === 'ig' ? props.shots.filter((s) => !s.igOptional) : props.shots;
}

const END_CARD_DURATION_S = 1.5;

export function shotDurationInFrames(shot: PostShotProps, fps: number): number {
  return Math.round((shot.durationS / shot.speed) * fps);
}

export function totalPostFrames(props: Pick<PostProps, 'shots' | 'variant'>, fps: number): number {
  const shots = visibleShots(props);
  const shotFrames = shots.reduce((sum, s) => sum + shotDurationInFrames(s, fps), 0);
  return shotFrames + Math.round(END_CARD_DURATION_S * fps);
}

export const END_CARD_FRAMES = (fps: number) => Math.round(END_CARD_DURATION_S * fps);

/**
 * Props for the `Compilation` composition (P0.8-07): title plate + body per
 * episode (no per-episode end card), then one shared end card at the very
 * end. Episodes use full shot lists — no fb/ig variant concept here.
 */
export type CompilationEpisode = {
  title: string;
  shots: PostShotProps[];
};

export type CompilationProps = {
  episodes: CompilationEpisode[];
  musicUrl?: string;
  musicGainDb: number;
  musicDuck: boolean;
  endCard: PostProps['endCard'];
  watermarkText: string;
};

const TITLE_PLATE_DURATION_S = 1.2;
export const CROSSFADE_FRAMES = 6;

export const titlePlateFrames = (fps: number) => Math.round(TITLE_PLATE_DURATION_S * fps);

export function episodeBodyFrames(shots: PostShotProps[], fps: number): number {
  return shots.reduce((sum, s) => sum + shotDurationInFrames(s, fps), 0);
}

// Title plate and episode body overlap by CROSSFADE_FRAMES (a crossfade, not
// a cut) — each episode's total span is therefore
// titleFrames + bodyFrames - CROSSFADE_FRAMES, not the plain sum.
export function totalCompilationFrames(
  props: Pick<CompilationProps, 'episodes'>,
  fps: number,
): number {
  const perEpisode = props.episodes.reduce(
    (sum, ep) => sum + titlePlateFrames(fps) + episodeBodyFrames(ep.shots, fps) - CROSSFADE_FRAMES,
    0,
  );
  return perEpisode + END_CARD_FRAMES(fps);
}
