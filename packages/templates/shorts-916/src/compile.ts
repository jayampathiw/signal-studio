import type {
  KenBurnsCutT as KenBurnsCut,
  KenBurnsOverlayT as KenBurnsOverlay,
  SoundDesignLayerT as SoundDesignLayer,
  TimelineSceneT,
  TimelineT,
} from '@signal-studio/core/schemas';
import type { CaptionChunk } from '@signal-studio/render-ffmpeg/captions';
import { splitOversizedCaptions } from '@signal-studio/render-ffmpeg/captions';
import { BEBAS_FONT } from '@signal-studio/render-ffmpeg/fonts';
import { TEXT_GEOMETRY } from '@signal-studio/render-ffmpeg/motion';
import { measureTextWidth } from '@signal-studio/render-ffmpeg/text-metrics';

/**
 * P3.2 — the `shorts-916` template's `compile()`: a bespoke-scene-list
 * config (see `ShortsConfig` below, matching
 * `content/shorts/*\/*.json`'s own shape) + resolved real assets → a
 * `Timeline`. Pure function, no I/O — same contract every other template's
 * `compile()` already follows.
 *
 * **Ported from `assemble-short-rewrite.mjs`, with the same architectural
 * shift P3.1 made for `stills-kenburns`, taken one step further**: the
 * original script interleaved TTS synthesis, Whisper alignment (including a
 * dedicated pass on `vo_parts[1]` alone to find where the "hit" musical cue
 * should land), rendering, AND a final layered-sound-design mix that
 * depended on each scene's ACTUAL rendered duration (`sceneMeta`, built
 * live during the render loop). All of that I/O moves to the caller:
 *
 * - **TTS + pause-concat + Whisper alignment is the caller's job**, supplied
 *   pre-resolved via `params.sceneVo` (keyed by 1-based scene number,
 *   matching the config's own `start_scene`/`end_scene` numbering) — same
 *   pattern as `stills-kenburns`'s `findVoPath`/`voDurationSec` callbacks,
 *   just as a plain map here since there's no shotlist to look scenes up
 *   against. For a `vo_parts` scene the caller has already run the
 *   pause+concat (`synthPausedScene`'s ffmpeg/Whisper work) and supplies the
 *   resulting `pauseStartInScene`/`hitOffsetInScene` directly — this
 *   function never calls ffmpeg or a TTS/ASR provider itself.
 * - **The VO-reconciliation duration math IS ported here** (`Math.max(
 *   target_duration_sec, voDurationSec + 0.4)`), same reasoning as P3.1:
 *   final per-scene `durationSecs` has to be baked into the Timeline before
 *   the render engine runs.
 * - **The sound-design layer-timing lookup math is ALSO ported here**
 *   (`applySoundDesign`'s `sceneMeta[...]` lookups in the original script) —
 *   it's pure arithmetic over each scene's own (now compile-time-known)
 *   `startSec`/`duration`/`pauseStartInScene`/`hitOffsetInScene`, so it
 *   belongs in `compile()`, not in the render engine. The render engine
 *   (`packages/render/ffmpeg/src/sound-design-mix.ts`) receives a flat,
 *   already-resolved `SoundDesignLayer[]` and does nothing but the ffmpeg
 *   mixing itself.
 *
 * **`phoneticizeForTTS` (Kokoro pronunciation fixes for a handful of
 * accented names) is NOT ported here** — it's a TTS-input concern (applies
 * to the text handed to the synthesiser, before this function ever runs),
 * not a Timeline-compile concern. It belongs wherever the real VO synthesis
 * call happens (the `tts` stage / a future `tts-kokoro` provider caller),
 * which is outside this template's own scope — there's no synthesis call
 * site inside `compile()` to attach it to.
 */

export type ShortsSoundDesignConfig = {
  hum?: { key: string; gain_db?: number };
  bed?: {
    key: string;
    gain_db?: number;
    start_scene: number;
    end_scene?: number | null;
    fade_in_sec?: number;
    resume_gain_db?: number;
    resume_fade_in_sec?: number;
  };
  heartbeat?: {
    key: string;
    gain_db?: number;
    start_scene: number;
    start_offset_sec?: number;
    end_scene: number;
    fade_in_sec?: number;
  };
  hit?: { key: string; gain_db?: number };
};

export type ShortsSceneConfig = {
  image?: string;
  image2?: string;
  motion?: string;
  motion2?: string;
  regrade?: 'warm_amber' | 'cold_blue' | null;
  regrade2?: 'warm_amber' | 'cold_blue' | null;
  crop_x?: number;
  crop_x2?: number;
  vo?: string;
  vo_parts?: string[];
  pause_sec?: number;
  target_duration_sec: number;
  hook?: { amber_word?: string };
  end_card_v2?: boolean;
  title?: string;
  subtitle?: string;
  hit_on_start?: boolean;
};

export type ShortsConfig = {
  output: string;
  voice?: string;
  scenes: ShortsSceneConfig[];
  sound_design?: ShortsSoundDesignConfig;
};

// Real, already-synthesized/measured/aligned VO for one scene — the
// caller's job (TTS synthesis, pause-concat, Whisper alignment all happen
// before compile() runs). `pauseStartInScene`/`hitOffsetInScene` only apply
// to `vo_parts` scenes (or an `end_card_v2` scene whose `vo_parts` carries a
// hit synced to a word spoken over the card itself).
export type ResolvedSceneVo = {
  path: string;
  durationSec: number;
  pauseStartInScene?: number;
  hitOffsetInScene?: number;
};

export type ShortsCompileParams = {
  contentId: string;
  config: ShortsConfig;
  // Resolves a config-relative image path (e.g.
  // "content/longform/x/stills/S01-A.jpg") to its real path on disk.
  resolveImagePath: (relPath: string) => string;
  // Keyed by 1-based scene number, matching config.scenes' own array
  // position and sound_design's start_scene/end_scene numbering.
  sceneVo?: Record<number, ResolvedSceneVo>;
  // Real Whisper caption chunks for non-hook shot scenes (vo or vo_parts),
  // already run through captions.ts's chunkCaptions() by the caller —
  // same convention as stills-kenburns's sceneCaptions param.
  sceneCaptions?: Record<number, CaptionChunk[]>;
  watermarkPath?: string;
  watermarkOpacity?: number;
};

const SHORT_FORMAT_WIDTH = 1080;
const SHORT_FORMAT_HEIGHT = 1920;

const HOOK_FONTSIZE = 72;
const HOOK_LINE_HEIGHT = Math.round(HOOK_FONTSIZE * 1.2);
const HOOK_Y_START = Math.round(SHORT_FORMAT_HEIGHT * 0.07);
const HOOK_MAX_WIDTH = SHORT_FORMAT_WIDTH * 0.88;
const CAPTION_MAX_WIDTH = SHORT_FORMAT_WIDTH * 0.92;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Ported unchanged from assemble-short-rewrite.mjs's wrapHookText — hook
// sentences (~50-70 chars) don't fit on one line at a readable size in a
// 1080px frame, so they're wrapped into multiple full-size lines instead of
// relying on buildHeroCard's own shrink-to-fit (which rescales purely by
// text-width-over-budget, independent of the starting fontsize — a single
// long hook line shrinks to near-illegible rather than wrapping).
function wrapHookText(text: string, fontsize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    const trial = [...current, word].join(' ');
    if (measureTextWidth(BEBAS_FONT, fontsize, trial) > maxWidth && current.length) {
      lines.push(current.join(' '));
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) lines.push(current.join(' '));
  return lines;
}

function buildHookOverlays(
  text: string,
  amberWord: string | undefined,
  durationSec: number,
): KenBurnsOverlay[] {
  const lines = wrapHookText(text, HOOK_FONTSIZE, HOOK_MAX_WIDTH);
  return lines.map((line, i) => ({
    format: 'tiered' as const,
    tier: 1 as const,
    text: line,
    amberWord: amberWord && line.includes(amberWord) ? amberWord : undefined,
    atSec: 0,
    durationSec,
    zone: 'upper center',
    y: String(HOOK_Y_START + i * HOOK_LINE_HEIGHT),
    fadeIn: 0,
  }));
}

function buildCaptionOverlays(chunks: CaptionChunk[]): KenBurnsOverlay[] {
  const overlays: {
    atSec: number;
    durationSec: number;
    words: Array<{ text: string; offsetStartSec: number; offsetEndSec: number }>;
  }[] = chunks.map((c) => ({
    atSec: c.start,
    durationSec: c.end - c.start,
    words: c.words.map((w) => ({
      text: w.text,
      offsetStartSec: w.start - c.start,
      offsetEndSec: w.end - c.start,
    })),
  }));
  // Split (never shrink) any chunk that would overflow the frame at the
  // fixed portrait caption size — keeps caption size visibly constant
  // across every scene instead of wobbling per chunk length.
  const split = splitOversizedCaptions(
    overlays,
    (text) => measureTextWidth(BEBAS_FONT, TEXT_GEOMETRY.portrait.captionFontsize, text),
    CAPTION_MAX_WIDTH,
  );
  return split.map((c) => ({
    format: 'tiered' as const,
    tier: 2 as const,
    atSec: c.atSec,
    durationSec: c.durationSec,
    words: c.words,
  }));
}

export class ShortsCompileError extends Error {}

type SceneMetaEntry = {
  startSec: number;
  duration: number;
  pauseStartInScene?: number;
  hitOffsetInScene?: number;
};

function buildSoundDesignLayers(
  sd: ShortsSoundDesignConfig,
  sceneMeta: Record<number, SceneMetaEntry>,
  totalDur: number,
): SoundDesignLayer[] {
  const layers: SoundDesignLayer[] = [];

  if (sd.hum) {
    layers.push({
      kind: 'loop',
      key: sd.hum.key,
      startSec: 0,
      endSec: totalDur,
      gainDb: sd.hum.gain_db ?? -34,
    });
  }

  if (sd.bed) {
    const b = sd.bed;
    const startSec = sceneMeta[b.start_scene].startSec;
    // Omitting end_scene means "never cuts" — the bed runs to the end of
    // the video (a continuous build/swell with no hard cut).
    const endScene = b.end_scene != null ? sceneMeta[b.end_scene] : null;
    const endSec =
      endScene == null
        ? totalDur
        : endScene.pauseStartInScene != null
          ? endScene.startSec + endScene.pauseStartInScene
          : endScene.startSec;
    layers.push({
      kind: 'loop',
      key: b.key,
      startSec,
      endSec,
      gainDb: b.gain_db ?? -20,
      fadeInSec: b.fade_in_sec ?? 1,
    });

    if (b.resume_gain_db != null) {
      const resumeStart =
        endScene?.hitOffsetInScene != null ? endScene.startSec + endScene.hitOffsetInScene : endSec;
      layers.push({
        kind: 'loop',
        key: b.key,
        startSec: resumeStart,
        endSec: totalDur,
        gainDb: b.resume_gain_db,
        fadeInSec: b.resume_fade_in_sec ?? 1.5,
        fadeOutSec: 0.3,
      });
    }
  }

  if (sd.heartbeat) {
    const hb = sd.heartbeat;
    const startScene = sceneMeta[hb.start_scene];
    const endScene = sceneMeta[hb.end_scene];
    const startSec = startScene.startSec + (hb.start_offset_sec ?? 0);
    const endSec =
      endScene.pauseStartInScene != null
        ? endScene.startSec + endScene.pauseStartInScene
        : endScene.startSec;
    layers.push({
      kind: 'loop',
      key: hb.key,
      startSec,
      endSec,
      gainDb: hb.gain_db ?? -20,
      fadeInSec: hb.fade_in_sec ?? 1.5,
    });
  }

  if (sd.hit) {
    const hitEntry = Object.entries(sceneMeta).find(([, m]) => m.hitOffsetInScene != null);
    if (hitEntry) {
      const [, meta] = hitEntry;
      layers.push({
        kind: 'oneshot',
        key: sd.hit.key,
        startSec: meta.startSec + (meta.hitOffsetInScene ?? 0),
        gainDb: sd.hit.gain_db ?? -6,
      });
    }
  }

  return layers;
}

export function compile(params: ShortsCompileParams): TimelineT {
  const scenes: TimelineSceneT[] = [];
  const sceneMeta: Record<number, SceneMetaEntry> = {};
  let cursor = 0;

  for (let i = 0; i < params.config.scenes.length; i++) {
    const scene = params.config.scenes[i];
    const n = i + 1;
    const label = `S${pad2(n)}`;
    const vo = params.sceneVo?.[n];

    if (scene.end_card_v2) {
      let dur = scene.target_duration_sec;
      let hitOffsetInScene: number | undefined;
      let pauseStartInScene: number | undefined;
      if (vo) {
        dur = Math.max(scene.target_duration_sec, vo.durationSec + 0.4);
        pauseStartInScene = vo.pauseStartInScene;
        // hit_on_start: for a scene whose VO IS the hit word, there's no
        // pause to detect a hit off of — the hit lands the instant speech
        // starts. A pure config-derived rule, computed here rather than
        // required from the caller.
        hitOffsetInScene = scene.vo_parts
          ? vo.hitOffsetInScene
          : scene.hit_on_start
            ? 0
            : vo.hitOffsetInScene;
      }
      scenes.push({
        id: label,
        durationSecs: dur,
        sceneType: 'title',
        endCard: { title: scene.title ?? '', subtitle: scene.subtitle ?? '' },
        narrationPath: vo?.path,
        playbackRate: 1,
        trimInSec: 0,
        sourceMuted: false,
      });
      sceneMeta[n] = { startSec: cursor, duration: dur, pauseStartInScene, hitOffsetInScene };
      cursor += dur;
      continue;
    }

    if (!scene.vo && !scene.vo_parts) {
      // Silent (music-only) scene — no VO to reconcile against, so
      // target_duration_sec is used as-is.
      const dur = scene.target_duration_sec;
      if (!scene.image) {
        throw new ShortsCompileError(`${label}: silent scene has no "image"`);
      }
      const cuts: KenBurnsCut[] = [
        {
          imagePath: params.resolveImagePath(scene.image),
          motion: (scene.motion as KenBurnsCut['motion']) ?? 'push',
          regrade: scene.regrade ?? undefined,
          cropX: scene.crop_x ?? 0.5,
          transition: 'cut',
          durationSecs: dur,
        },
      ];
      scenes.push({
        id: label,
        durationSecs: dur,
        sceneType: 'shot',
        cuts,
        playbackRate: 1,
        trimInSec: 0,
        sourceMuted: false,
      });
      sceneMeta[n] = { startSec: cursor, duration: dur };
      cursor += dur;
      continue;
    }

    if (!vo) {
      throw new ShortsCompileError(`${label}: no resolved VO supplied (params.sceneVo[${n}])`);
    }
    if (!scene.image) {
      throw new ShortsCompileError(`${label}: no "image"`);
    }
    const fullText = scene.vo_parts ? scene.vo_parts.join(' ') : (scene.vo ?? '');
    const dur = Math.max(scene.target_duration_sec, vo.durationSec + 0.4);

    let overlays: KenBurnsOverlay[];
    if (scene.hook) {
      overlays = buildHookOverlays(
        fullText,
        scene.hook.amber_word,
        Math.min(3, scene.target_duration_sec),
      );
    } else {
      overlays = buildCaptionOverlays(params.sceneCaptions?.[n] ?? []);
    }

    // scene.image2 cuts to a second still partway through the scene (equal
    // split, matching assemble-short-rewrite.mjs's own buildStillsScene
    // default — this template never uses stills-kenburns's caption-based
    // auto-cut-split).
    const stillConfigs: Array<{
      imagePath: string;
      motion?: string;
      regrade?: 'warm_amber' | 'cold_blue' | null;
      cropX?: number;
    }> = [
      { imagePath: scene.image, motion: scene.motion, regrade: scene.regrade, cropX: scene.crop_x },
    ];
    if (scene.image2) {
      stillConfigs.push({
        imagePath: scene.image2,
        motion: scene.motion2,
        regrade: scene.regrade2,
        cropX: scene.crop_x2,
      });
    }
    const cutDur = dur / stillConfigs.length;
    const cuts: KenBurnsCut[] = stillConfigs.map((s) => ({
      imagePath: params.resolveImagePath(s.imagePath),
      motion: (s.motion as KenBurnsCut['motion']) ?? 'push',
      regrade: s.regrade ?? undefined,
      cropX: s.cropX ?? 0.5,
      transition: 'cut',
      durationSecs: cutDur,
    }));

    scenes.push({
      id: label,
      durationSecs: dur,
      sceneType: 'shot',
      cuts,
      kenBurnsOverlays: overlays.length ? overlays : undefined,
      narrationPath: vo.path,
      playbackRate: 1,
      trimInSec: 0,
      sourceMuted: false,
    });
    sceneMeta[n] = {
      startSec: cursor,
      duration: dur,
      pauseStartInScene: vo.pauseStartInScene,
      hitOffsetInScene: vo.hitOffsetInScene,
    };
    cursor += dur;
  }

  const totalDur = cursor;
  const soundDesignLayers = params.config.sound_design
    ? buildSoundDesignLayers(params.config.sound_design, sceneMeta, totalDur)
    : [];

  return {
    contentId: params.contentId,
    aspectRatio: '9:16',
    template: 'shorts-916',
    scenes,
    watermark: params.watermarkPath
      ? {
          path: params.watermarkPath,
          position: 'bottom-right',
          opacity: params.watermarkOpacity ?? 0.4,
        }
      : undefined,
    soundDesign: soundDesignLayers.length ? { layers: soundDesignLayers } : undefined,
  };
}
