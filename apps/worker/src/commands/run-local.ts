import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveJob } from '@signal-studio/core/resolve';
import { StageRunner, type Job, type JobStageStore } from '@signal-studio/core/runner';
import {
  Manifest,
  Project,
  type CarouselOutputT,
  type TimelineT,
} from '@signal-studio/core/schemas';
import { createAssetsStage } from '@signal-studio/core/stages/assets';
import { createTtsStage, type TtsSynthesiser } from '@signal-studio/core/stages/tts';
import type { CarouselCompileParams } from '@signal-studio/template-carousel/compile';
import type { CaseFileCompileParams } from '@signal-studio/template-case-file/compile';
import type {
  ResolvedSceneVo,
  ShortsCompileParams,
} from '@signal-studio/template-shorts-916/compile';
import type { StillsKenburnsCompileParams } from '@signal-studio/template-stills-kenburns/compile';
import type { ParsedShotlist } from '@signal-studio/template-stills-kenburns/parsers/parse-shotlist-v2';

import type { Logger } from '../logger.ts';

/**
 * P2.5 — `ss run-local --manifest --project --out`: no DB, no queue. Loads a
 * manifest + project from local files and renders each `manifest.outputs[]`
 * entry straight to `--out`. `ss run-job` (DB-backed) is the real-storage,
 * real-queue counterpart — this is the "does the whole pipeline actually
 * wire together" command, for a fast local dev loop.
 *
 * **P3's T-L gate — generalized beyond `clips-overlay` (2026-10-16)**:
 * originally only `clips-overlay` was supported here (this command predates
 * `run-job.ts`'s own P3.7 generalization to a `TemplateHandler` registry).
 * This now covers all 5 templates, each as its own local-file-based
 * function below — deliberately NOT a re-use of `run-job.ts`'s own
 * `TemplateHandler`s, which are storage/DB-coupled by design (`JobRow`,
 * `ArtifactsRepo`, `downloadRawAsset()` against a `StorageProvider`); this
 * command has no DB or storage at all, so each function here reads straight
 * off local directories under `workDir` instead (mirroring the exact
 * `clips/`/`vo/` convention `clips-overlay`'s own original handling already
 * established), and compiles via the one real template `compile()` each
 * template already ships — no new business logic, just local I/O plumbing.
 * `compilation` stays unsupported (same reasoning as before: its `compile()`
 * takes *already-rendered* episode Timelines, which by definition means the
 * episodes were each their own prior job — nothing a single local
 * manifest+project invocation has to compile from).
 */

export type RunLocalOptions = {
  manifestPath: string;
  projectPath: string;
  outDir: string;
  workDir?: string;
  contentId?: string;
};

export type RunLocalDeps = {
  synthesise: TtsSynthesiser;
  compileClipsOverlay: (
    resolvedJob: ReturnType<typeof resolveJob>,
    params: {
      contentId: string;
      outputId: string;
      shotAssets: Record<string, { clipPath: string; durationS: number }>;
      shotVoiceovers: Record<string, { path: string; durationS: number }>;
    },
  ) => TimelineT;
  // Optional: only required for the templates below that use them — the
  // pre-existing `clips-overlay`-only callers (and their own tests) never
  // needed to provide them.
  compileCaseFile?: (params: CaseFileCompileParams) => TimelineT;
  compileStillsKenburns?: (params: StillsKenburnsCompileParams) => TimelineT;
  compileShorts916?: (params: ShortsCompileParams) => TimelineT;
  compileCarousel?: (params: CarouselCompileParams) => CarouselOutputT;
  parseShotlistV2?: (text: string) => ParsedShotlist;
  // Remotion-engine render — `clips-overlay`/`case-file`.
  render: (timeline: TimelineT, opts: { outputDir: string }) => Promise<string>;
  // ffmpeg-engine render — `stills-kenburns`/`shorts-916`. Optional: only
  // `clips-overlay`'s own pre-existing caller path never needed it.
  renderFfmpeg?: (timeline: TimelineT, opts: { outputDir: string }) => Promise<string>;
  renderCarouselStills?: (
    output: CarouselOutputT,
    opts: { outputDir: string; watermarkPath?: string },
  ) => Promise<string[]>;
};

export type RunLocalResult = { outputs: Record<string, string | string[]> };

// No persistence: `ss run-local` is a one-shot, re-run-whenever-you-like
// command (per the plan's own "no DB" wording) — every stage always runs,
// nothing is ever skipped as "unchanged since last time" because there is
// no "last time" to compare against outside a DB-backed job.
function createNullStore(): JobStageStore {
  return {
    async getLastRun() {
      return null;
    },
    async recordStart() {},
    async recordEnd() {},
    async log() {},
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

async function runClipsOverlayLocal(
  manifest: ReturnType<typeof Manifest.parse>,
  resolvedJob: ReturnType<typeof resolveJob>,
  opts: RunLocalOptions,
  deps: RunLocalDeps,
  logger: Logger,
  workDir: string,
  contentId: string,
): Promise<RunLocalResult> {
  const job: Job = { id: contentId, manifest, workDir };
  const runner = new StageRunner(createNullStore()).register(createAssetsStage()).register(
    createTtsStage({
      synthesise: deps.synthesise,
      voice: resolvedJob.voice,
      speed: resolvedJob.speed,
    }),
  );

  logger.info('running assets + tts stages', { workDir });
  const stageOutputs = await runner.run(job);

  const assetsOut = stageOutputs.get('assets:') as
    { durations: Record<string, number> } | undefined;
  if (!assetsOut) throw new Error('run-local: assets stage produced no outputs');
  const ttsOut = stageOutputs.get('tts:') as { durations: Record<string, number> } | undefined;

  const shotAssets: Record<string, { clipPath: string; durationS: number }> = {};
  for (const shot of manifest.shots) {
    if (!shot.clip) continue;
    shotAssets[shot.id] = {
      clipPath: path.join(workDir, 'clips', shot.clip),
      durationS: assetsOut.durations[shot.id],
    };
  }

  const shotVoiceovers: Record<string, { path: string; durationS: number }> = {};
  for (const shot of manifest.shots) {
    const durationS = ttsOut?.durations[shot.id];
    if (durationS !== undefined) {
      shotVoiceovers[shot.id] = { path: path.join(workDir, 'vo', `${shot.id}.wav`), durationS };
    }
  }

  const outputs: Record<string, string> = {};
  for (const outputId of resolvedJob.outputs) {
    // Each output gets its own contentId — render.ts names the file
    // `${timeline.contentId}.mp4`, so reusing one contentId across fb/ig
    // would have the second render silently overwrite the first.
    const timeline = deps.compileClipsOverlay(resolvedJob, {
      contentId: `${contentId}_${outputId}`,
      outputId,
      shotAssets,
      shotVoiceovers,
    });
    logger.info(`rendering ${outputId}`, { scenes: timeline.scenes.length });
    const outputPath = await deps.render(timeline, { outputDir: opts.outDir });
    outputs[outputId] = outputPath;
    logger.info(`rendered ${outputId}`, { outputPath });
  }

  return { outputs };
}

async function runCaseFileLocal(
  manifest: ReturnType<typeof Manifest.parse>,
  resolvedJob: ReturnType<typeof resolveJob>,
  opts: RunLocalOptions,
  deps: RunLocalDeps,
  logger: Logger,
  workDir: string,
  contentId: string,
): Promise<RunLocalResult> {
  const caseConfig = manifest.case_file;
  if (!caseConfig) throw new Error('run-local: case-file jobs require manifest.case_file');
  if (!deps.compileCaseFile) throw new Error('run-local: case-file requires deps.compileCaseFile');

  // Narrate every shot with narration text — same convention `run-job.ts`'s
  // `caseFileHandler` establishes, just synthesised directly instead of via
  // the shared `tts` stage (no DB-backed stage store here to key it to).
  const narrationPaths: Record<string, string> = {};
  const narrationDurations: Record<string, number> = {};
  for (const shot of manifest.shots) {
    if (!shot.voiceover_text) continue;
    const { wavPath, durationSec } = await deps.synthesise({
      text: shot.voiceover_text,
      voice: resolvedJob.voice,
      speed: resolvedJob.speed,
    });
    narrationPaths[shot.id] = wavPath;
    narrationDurations[shot.id] = durationSec;
  }

  const scenes = manifest.shots.map((shot) => ({
    id: shot.id,
    imagePath: shot.image ? path.join(workDir, 'images', shot.image) : undefined,
    narrationText: shot.voiceover_text,
    captionText: shot.text,
    durationSecs: shot.durationSecs,
    holdExtraSecs: shot.holdExtraSecs,
    highlight: shot.highlight,
    highlights: shot.highlights,
    zoomFrom: shot.zoomFrom,
    zoomTo: shot.zoomTo,
    visual: shot.visual,
    waveformOverlay: shot.waveformOverlay,
  }));

  const renderFn = deps.render;
  const outputs: Record<string, string> = {};
  for (const outputId of resolvedJob.outputs) {
    const timeline = deps.compileCaseFile({
      contentId: `${contentId}_${outputId}`,
      aspectRatio: caseConfig.aspectRatio,
      scenes,
      caseId: caseConfig.caseId,
      sourceCitation: caseConfig.sourceCitation,
      hideSourceOnScreen: caseConfig.hideSourceOnScreen,
      specimen: caseConfig.specimen,
      showOutro: caseConfig.showOutro,
      findNarrationPath: (sceneId) => narrationPaths[sceneId] ?? null,
      narrationDurationSec: (sceneId) => narrationDurations[sceneId],
      transcribedWords: () => null,
    });
    logger.info(`rendering ${outputId}`, { scenes: timeline.scenes.length });
    const outputPath = await renderFn(timeline, { outputDir: opts.outDir });
    outputs[outputId] = outputPath;
    logger.info(`rendered ${outputId}`, { outputPath });
  }
  return { outputs };
}

async function runStillsKenburnsLocal(
  manifest: ReturnType<typeof Manifest.parse>,
  resolvedJob: ReturnType<typeof resolveJob>,
  opts: RunLocalOptions,
  deps: RunLocalDeps,
  logger: Logger,
  workDir: string,
  contentId: string,
): Promise<RunLocalResult> {
  const config = manifest.stillsKenburns;
  if (!config) {
    throw new Error('run-local: stills-kenburns jobs require manifest.stillsKenburns');
  }
  if (!deps.renderFfmpeg) {
    throw new Error('run-local: stills-kenburns requires deps.renderFfmpeg (ffmpeg engine)');
  }
  if (!deps.parseShotlistV2 || !deps.compileStillsKenburns) {
    throw new Error(
      'run-local: stills-kenburns requires deps.parseShotlistV2/compileStillsKenburns',
    );
  }

  const parsed = deps.parseShotlistV2(config.shotlistText);

  const stillLocalPaths: Record<string, string> = {};
  for (const [shotId, filename] of Object.entries(config.stillImages)) {
    stillLocalPaths[shotId] = path.join(workDir, 'stills', filename);
  }

  const voPaths: Record<string, string> = {};
  const voDurations: Record<string, number> = {};
  for (const scene of parsed.scenes) {
    if (!scene.vo_text) continue;
    const key = `S${pad2(scene.scene_n)}`;
    const { wavPath, durationSec } = await deps.synthesise({
      text: scene.vo_text,
      voice: resolvedJob.voice,
      speed: resolvedJob.speed,
    });
    voPaths[key] = wavPath;
    voDurations[key] = durationSec;
  }

  const outputs: Record<string, string> = {};
  for (const outputId of resolvedJob.outputs) {
    const timeline = deps.compileStillsKenburns({
      contentId: `${contentId}_${outputId}`,
      aspectRatio: config.aspectRatio,
      parsed,
      findStillPath: (sceneN, cut) => stillLocalPaths[`S${pad2(sceneN)}-${cut}`] ?? null,
      findVoPath: (sceneN) => voPaths[`S${pad2(sceneN)}`] ?? null,
      voDurationSec: (sceneN) => voDurations[`S${pad2(sceneN)}`],
    });
    logger.info(`rendering ${outputId}`, { scenes: timeline.scenes.length });
    const outputPath = await deps.renderFfmpeg(timeline, { outputDir: opts.outDir });
    outputs[outputId] = outputPath;
    logger.info(`rendered ${outputId}`, { outputPath });
  }
  return { outputs };
}

async function runShorts916Local(
  manifest: ReturnType<typeof Manifest.parse>,
  resolvedJob: ReturnType<typeof resolveJob>,
  opts: RunLocalOptions,
  deps: RunLocalDeps,
  logger: Logger,
  workDir: string,
  contentId: string,
): Promise<RunLocalResult> {
  const config = manifest.shorts916;
  if (!config) throw new Error('run-local: shorts-916 jobs require manifest.shorts916');
  if (!deps.renderFfmpeg) {
    throw new Error('run-local: shorts-916 requires deps.renderFfmpeg (ffmpeg engine)');
  }
  if (!deps.compileShorts916)
    throw new Error('run-local: shorts-916 requires deps.compileShorts916');

  const imageLocalPaths: Record<string, string> = {};
  for (const [key, filename] of Object.entries(config.images)) {
    imageLocalPaths[key] = path.join(workDir, 'stills', filename);
  }

  // `vo_parts` (two-part pause-concat scenes) aren't supported in this local
  // path — that needs real ffmpeg pause-concat work `run-job.ts`'s own
  // `synthPausedVo` does, which isn't worth duplicating here just for a
  // fake-render smoke check. Flagged, not silently ignored.
  const voice = config.voice ?? resolvedJob.voice;
  const sceneVo: Record<number, ResolvedSceneVo> = {};
  for (let i = 0; i < config.scenes.length; i++) {
    const scene = config.scenes[i];
    if (scene.vo_parts) {
      throw new Error(
        `run-local: shorts-916 scene ${i + 1} uses vo_parts, not supported by run-local (use ss run-job)`,
      );
    }
    if (scene.vo) {
      const { wavPath, durationSec } = await deps.synthesise({
        text: scene.vo,
        voice,
        speed: resolvedJob.speed,
      });
      sceneVo[i + 1] = { path: wavPath, durationSec };
    }
  }

  const outputs: Record<string, string> = {};
  for (const outputId of resolvedJob.outputs) {
    const timeline = deps.compileShorts916({
      contentId: `${contentId}_${outputId}`,
      config,
      resolveImagePath: (key) => {
        const resolved = imageLocalPaths[key];
        if (!resolved) throw new Error(`run-local: no local image for key "${key}"`);
        return resolved;
      },
      sceneVo,
    });
    logger.info(`rendering ${outputId}`, { scenes: timeline.scenes.length });
    const outputPath = await deps.renderFfmpeg(timeline, { outputDir: opts.outDir });
    outputs[outputId] = outputPath;
    logger.info(`rendered ${outputId}`, { outputPath });
  }
  return { outputs };
}

async function runCarouselLocal(
  manifest: ReturnType<typeof Manifest.parse>,
  opts: RunLocalOptions,
  deps: RunLocalDeps,
  logger: Logger,
  workDir: string,
  contentId: string,
): Promise<RunLocalResult> {
  const config = manifest.carousel;
  if (!config) throw new Error('run-local: carousel jobs require manifest.carousel');
  if (!deps.renderCarouselStills) {
    throw new Error('run-local: carousel requires deps.renderCarouselStills');
  }
  if (!deps.compileCarousel) throw new Error('run-local: carousel requires deps.compileCarousel');

  const watermarkPath = config.watermarkImage
    ? path.join(workDir, 'stills', config.watermarkImage)
    : undefined;

  const output = deps.compileCarousel({
    contentId,
    slides: config.slides,
    watermarkPath,
  });
  logger.info('rendering carousel', { slides: output.slides.length });
  const slidePaths = await deps.renderCarouselStills(output, {
    outputDir: opts.outDir,
    watermarkPath,
  });
  logger.info('rendered carousel', { slidePaths });
  // Carousel has no fb/ig output-id concept (see manifest.v1.ts's own
  // CarouselJobConfig header) — one job, one set of stills.
  return { outputs: { carousel: slidePaths } };
}

export async function runLocal(
  opts: RunLocalOptions,
  deps: RunLocalDeps,
  logger: Logger,
): Promise<RunLocalResult> {
  const manifest = Manifest.parse(JSON.parse(await readFile(opts.manifestPath, 'utf8')));
  const project = Project.parse(JSON.parse(await readFile(opts.projectPath, 'utf8')));
  const resolvedJob = resolveJob(project, manifest);

  const workDir = opts.workDir ?? path.dirname(path.resolve(opts.manifestPath));
  const contentId = opts.contentId ?? path.basename(workDir);

  switch (manifest.visual.mode) {
    case 'clips-overlay':
      return runClipsOverlayLocal(manifest, resolvedJob, opts, deps, logger, workDir, contentId);
    case 'case-file':
      return runCaseFileLocal(manifest, resolvedJob, opts, deps, logger, workDir, contentId);
    case 'stills-kenburns':
      return runStillsKenburnsLocal(manifest, resolvedJob, opts, deps, logger, workDir, contentId);
    case 'shorts-916':
      return runShorts916Local(manifest, resolvedJob, opts, deps, logger, workDir, contentId);
    case 'carousel':
      return runCarouselLocal(manifest, opts, deps, logger, workDir, contentId);
    default:
      throw new Error(
        `run-local: unsupported visual.mode "${manifest.visual.mode}" — "compilation" can't run from a single local manifest (its compile() takes already-rendered episode Timelines as input, which by definition means the episodes were each their own prior job; use \`ss run-job\` once those jobs exist)`,
      );
  }
}
