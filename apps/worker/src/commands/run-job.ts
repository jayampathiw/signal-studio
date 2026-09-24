import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { resolveJob, type ResolvedJob } from '@signal-studio/core/resolve';
import { StageRunner, type Job, type JobStageStore } from '@signal-studio/core/runner';
import type { TimelineT, ProjectT } from '@signal-studio/core/schemas';
import { createAssetsStage } from '@signal-studio/core/stages/assets';
import { createPublishStage, type PublishFn } from '@signal-studio/core/stages/publish';
import {
  createQaStage,
  type QaBlackSegment,
  type QaMeasurement,
} from '@signal-studio/core/stages/qa';
import { createTtsStage, type TtsSynthesiser } from '@signal-studio/core/stages/tts';
import { assertJobTransition, type JobStatus } from '@signal-studio/core/state';
import type { ArtifactsRepo, JobRow, JobsRepo, ProjectsRepo } from '@signal-studio/db/repos';
import type { PublishProvider, StorageProvider } from '@signal-studio/providers/contracts';
import { probeDuration } from '@signal-studio/render-ffmpeg/stills-render';
import type { CaseFileCompileParams } from '@signal-studio/template-case-file/compile';
import type {
  ResolvedSceneVo,
  ShortsCompileParams,
} from '@signal-studio/template-shorts-916/compile';
import type { StillsKenburnsCompileParams } from '@signal-studio/template-stills-kenburns/compile';
import type { ParsedShotlist } from '@signal-studio/template-stills-kenburns/parsers/parse-shotlist-v2';

import type { Logger } from '../logger.ts';

const execFileAsync = promisify(execFile);

// **Deliberate, flagged convention**: `Timeline.aspectRatio` names a ratio,
// not pixels — nothing else in `timeline.v1`/`manifest.v1` pins the actual
// canonical resolution per ratio, so the `qa` stage's "resolution" check
// needs its own explicit mapping. `fps: 30` is specific to templates that
// render via Remotion (`clips-overlay`, `case-file`, `compilation`) —
// every real golden reference through `render-remotion` measures 30fps.
// `stills-kenburns`/`shorts-916` render via `render-ffmpeg` instead, and
// measure ~25fps in their own real golden references (P3.1/P3.2) — each
// handler below passes its own engine's real fps expectation, not this
// shared constant, when it differs.
const CANONICAL_RESOLUTION: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};
const REMOTION_FPS = 30;
const FFMPEG_FPS = 25;

// **Deliberate, flagged convention**: nothing in `manifest.v1`/`project.v1`
// pins how a rendered `outputId` ('fb'/'ig', the short codes every real
// pack/manifest in this repo uses — see `docs/refactor/refactor-plan.md`'s
// P3.5 entry) maps to a `publish[]` platform name ('facebook'/'instagram').
// This is that mapping, made explicit here rather than guessed silently
// inline. `'yt'` is included even though no real example uses it yet, for
// the same reason `publish-youtube.ts` already exists — so a future
// 9:16/16:9 output pair with a YouTube leg doesn't need this map touched.
const OUTPUT_TO_PLATFORM: Record<string, string> = {
  fb: 'facebook',
  ig: 'instagram',
  yt: 'youtube',
};

/**
 * P2.5 — `ss run-job --id`: the DB-backed counterpart to `run-local`. Reads
 * and writes real rows and real object storage instead of local files.
 *
 * **P3.7's "generalize beyond clips-overlay" gap closed here**: dispatches
 * on `job.manifest.visual.mode` to one of 5 `TemplateHandler`s (below),
 * each owning that template's own real asset-ingestion path — they differ
 * enormously (a flat `shots[]` of clips for `clips-overlay`, document
 * images + optional highlight/zoom geometry for `case-file`, a whole
 * `shotlist-v2.md` text blob + per-cut stills for `stills-kenburns`, a
 * bespoke `ShortsConfig` JSON blob for `shorts-916`, N nested episode
 * manifests for `compilation`) — so there's no single shared "resolve
 * assets" step across all of them, only a shared *shape* (`compileOutputs`
 * returns `Record<outputId, TimelineT>`) that the render/upload/QA/publish
 * pipeline below runs identically regardless of which handler produced it.
 *
 * **Deliberately NOT wired for real Whisper transcription this pass,
 * flagged rather than silently skipped**: `case-file`/`stills-kenburns`/
 * `shorts-916`'s own `compile()` all accept an optional real-transcript
 * resolver (`transcribedWords`/`sceneCaptions`) and gracefully fall back to
 * the authored caption/script text when it returns nothing — every handler
 * below takes that fallback path. Building a reusable `captions`/whisper
 * stage is real, separate scope; P3.1/P3.2/P3.3's own original real
 * verifications exercised the real-transcript path by hand, outside a real
 * job, which is what those templates' own tracker entries already record.
 *
 * **Real gap this surfaces, not silently worked around**: there is no
 * "upload a job's raw assets" step anywhere yet except this command's own
 * sibling, `ss upload` — nothing auto-ingests a shot's file into storage.
 * Every handler downloads its own raw assets from
 * `jobs/<jobId>/uploads/<shotId>/<file>` (the key convention `ss upload`
 * writes to) via `storage.signedUrl()` + `fetch()`. If nothing was uploaded
 * there yet, this fails with a clear message telling the caller to run
 * `ss upload` first, rather than silently producing an empty render.
 *
 * **Also flagged, not implemented**: real gate evaluation. `manifest.gates`
 * names *which* gates apply (per `manifest.v1.ts`'s own comment, "the actual
 * gate logic lives in packages/providers" — not built yet). This command
 * only marks a job `awaiting_review:<firstGate>` when gates are present,
 * exactly as the state machine's own transition table allows; it does not
 * evaluate anything.
 *
 * **Publish** fires once every output has rendered, and only when the job
 * has *no* gates (a gated job stops at `awaiting_review:<gate>` — no real
 * gate-approval path exists yet to unblock it from there). Dispatches each
 * `manifest.publish[]` platform to a real `PublishProvider` (`deps.
 * createPublishProviderFor`), resolving `pageRef` from
 * `project.publishTargets[]` and each platform's rendered video URL from
 * `OUTPUT_TO_PLATFORM`. Registered on the *same* `StageRunner` as
 * `assets`/`tts`/`qa`, so a retried job's skip-on-unchanged-hash behavior
 * covers publish too — it won't double-post.
 *
 * **`qa` runs right after every output renders, before the gates/publish
 * decision** — a QA failure marks the job `failed` the same way any other
 * stage failure does, blocking both.
 */

export type RunJobOptions = {
  jobId: string;
};

export type RunJobDeps = {
  jobsRepo: JobsRepo;
  projectsRepo: ProjectsRepo;
  // Factories, not fixed instances: both `ArtifactsRepo` and `JobStagesRepo`
  // need the job's org_id at construction time (P1.5's design), but this
  // command doesn't know it until after loading the job.
  createArtifactsRepo: (orgId: string) => ArtifactsRepo;
  createStageStore: (orgId: string) => JobStageStore;
  createStorage: (providerId: string) => StorageProvider;
  synthesise: TtsSynthesiser;
  compileClipsOverlay: (
    resolvedJob: ResolvedJob,
    params: {
      contentId: string;
      outputId: string;
      shotAssets: Record<string, { clipPath: string; durationS: number }>;
      shotVoiceovers: Record<string, { path: string; durationS: number }>;
    },
  ) => TimelineT;
  compileCaseFile: (params: CaseFileCompileParams) => TimelineT;
  compileStillsKenburns: (params: StillsKenburnsCompileParams) => TimelineT;
  compileShorts916: (params: ShortsCompileParams) => TimelineT;
  parseShotlistV2: (text: string) => ParsedShotlist;
  render: (timeline: TimelineT, opts: { outputDir: string }) => Promise<string>;
  // Used by `render-ffmpeg`-based templates (`stills-kenburns`,
  // `shorts-916`) — optional so a caller's `deps` that never touches either
  // template doesn't need to supply it; `renderJob`'s own dispatch throws a
  // clear error if a handler needs it but wasn't given one.
  renderFfmpeg?: (timeline: TimelineT, opts: { outputDir: string }) => Promise<string>;
  createPublishProviderFor: (platform: string, credentialRef: string) => PublishProvider;
  measureVideo: (localPath: string) => Promise<QaMeasurement>;
  detectBlackFrames: (localPath: string) => Promise<QaBlackSegment[]>;
  // Only ever called when `project.qa.visionCheck` is true — omitted from
  // most jobs' path entirely, not just short-circuited, so a missing
  // ANTHROPIC_KEY never breaks a job that doesn't use it.
  visionCheck?: (localPath: string) => Promise<{ ok: boolean; notes: string }>;
  fetchFn?: typeof fetch;
};

// Minimal legal path from wherever a job currently sits to `running`, per
// `packages/core/src/state/index.ts`'s own transition table — walked
// explicitly (via `assertJobTransition`) rather than jumping straight there,
// since no dispatcher (P2.7) exists yet to have put a job in `dispatched`
// for us. `failed` is included so a failed job can be retried by re-running
// this command, mirroring `JOB_TRANSITIONS.failed = ['queued']`.
const PATH_TO_RUNNING: Record<string, JobStatus[]> = {
  created: ['queued', 'dispatched', 'running'],
  queued: ['dispatched', 'running'],
  dispatched: ['running'],
  failed: ['queued', 'dispatched', 'running'],
};

async function advanceToRunning(jobsRepo: JobsRepo, job: JobRow, logger: Logger): Promise<void> {
  const path_ = PATH_TO_RUNNING[job.status];
  if (!path_) {
    throw new Error(
      `run-job: job "${job.id}" is in status "${job.status}", not runnable from here (expected one of created/queued/dispatched/failed)`,
    );
  }
  let current: JobStatus = job.status;
  for (const next of path_) {
    assertJobTransition(current, next);
    await jobsRepo.updateStatus(job.id, next);
    logger.info(`job ${current} -> ${next}`, { jobId: job.id });
    current = next;
  }
}

async function downloadRawAsset(
  storage: StorageProvider,
  jobId: string,
  shotId: string,
  file: string,
  destDir: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const key = `jobs/${jobId}/uploads/${shotId}/${file}`;
  const url = await storage.signedUrl(key);
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(
      `run-job: raw asset not found for shot "${shotId}" (${key}) — run \`ss upload --job ${jobId} --shot ${shotId} --file <file>\` first`,
    );
  }
  const dest = path.join(destDir, file);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

// Shared "expected" shape the render/QA loop needs from every handler,
// regardless of template — the render engine differs (`remotion` vs
// `ffmpeg`), so each handler names which one produced its timelines too.
export type TemplateOutput = {
  timelines: Record<string, TimelineT>;
  engine: 'remotion' | 'ffmpeg';
};

export type TemplateHandlerCtx = {
  job: JobRow;
  project: ProjectT;
  resolvedJob: ResolvedJob;
  tmpDir: string;
  storage: StorageProvider;
  fetchFn: typeof fetch;
  runner: StageRunner;
  deps: RunJobDeps;
  logger: Logger;
};

export type TemplateHandler = {
  compileOutputs(ctx: TemplateHandlerCtx): Promise<TemplateOutput>;
};

// ---- clips-overlay ----

const clipsOverlayHandler: TemplateHandler = {
  async compileOutputs(ctx) {
    const { job, resolvedJob, tmpDir, storage, fetchFn, runner, deps } = ctx;

    for (const shot of job.manifest.shots) {
      if (!shot.clip) continue;
      await downloadRawAsset(
        storage,
        job.id,
        shot.id,
        shot.clip,
        path.join(tmpDir, 'clips', 'raw'),
        fetchFn,
      );
    }

    const stageJob: Job = { id: job.id, manifest: job.manifest, workDir: tmpDir };
    runner.register(createAssetsStage()).register(
      createTtsStage({
        synthesise: deps.synthesise,
        voice: resolvedJob.voice,
        speed: resolvedJob.speed,
      }),
    );

    const stageOutputs = await runner.run(stageJob);
    const assetsOut = stageOutputs.get('assets:') as
      { durations: Record<string, number> } | undefined;
    if (!assetsOut) throw new Error('run-job: assets stage produced no outputs');
    const ttsOut = stageOutputs.get('tts:') as { durations: Record<string, number> } | undefined;

    const shotAssets: Record<string, { clipPath: string; durationS: number }> = {};
    for (const shot of job.manifest.shots) {
      if (!shot.clip) continue;
      shotAssets[shot.id] = {
        clipPath: path.join(tmpDir, 'clips', shot.clip),
        durationS: assetsOut.durations[shot.id],
      };
    }
    const shotVoiceovers: Record<string, { path: string; durationS: number }> = {};
    for (const shot of job.manifest.shots) {
      const durationS = ttsOut?.durations[shot.id];
      if (durationS !== undefined) {
        shotVoiceovers[shot.id] = { path: path.join(tmpDir, 'vo', `${shot.id}.wav`), durationS };
      }
    }

    const timelines: Record<string, TimelineT> = {};
    for (const outputId of resolvedJob.outputs) {
      timelines[outputId] = deps.compileClipsOverlay(resolvedJob, {
        contentId: `${job.id}_${outputId}`,
        outputId,
        shotAssets,
        shotVoiceovers,
      });
    }
    return { timelines, engine: 'remotion' };
  },
};

// ---- case-file ----

const caseFileHandler: TemplateHandler = {
  async compileOutputs(ctx) {
    const { job, resolvedJob, tmpDir, storage, fetchFn, runner, deps } = ctx;
    const caseConfig = job.manifest.case_file;
    if (!caseConfig) {
      throw new Error('run-job: case-file jobs require manifest.case_file');
    }

    for (const shot of job.manifest.shots) {
      if (!shot.image) continue;
      await downloadRawAsset(
        storage,
        job.id,
        shot.id,
        shot.image,
        path.join(tmpDir, 'images'),
        fetchFn,
      );
    }

    const stageJob: Job = { id: job.id, manifest: job.manifest, workDir: tmpDir };
    runner.register(
      createTtsStage({
        synthesise: deps.synthesise,
        voice: resolvedJob.voice,
        speed: resolvedJob.speed,
      }),
    );
    const stageOutputs = await runner.run(stageJob);
    const ttsOut = stageOutputs.get('tts:') as { durations: Record<string, number> } | undefined;

    const scenes = job.manifest.shots.map((shot) => ({
      id: shot.id,
      imagePath: shot.image ? path.join(tmpDir, 'images', shot.image) : undefined,
      narrationText: shot.voiceover_text,
      captionText: shot.text,
      durationSecs: undefined,
      holdExtraSecs: shot.holdExtraSecs,
      highlight: shot.highlight,
      highlights: shot.highlights,
      zoomFrom: shot.zoomFrom,
      zoomTo: shot.zoomTo,
      waveformOverlay: shot.waveformOverlay,
    }));

    const timelines: Record<string, TimelineT> = {};
    for (const outputId of resolvedJob.outputs) {
      timelines[outputId] = deps.compileCaseFile({
        contentId: `${job.id}_${outputId}`,
        aspectRatio: caseConfig.aspectRatio,
        scenes,
        caseId: caseConfig.caseId,
        sourceCitation: caseConfig.sourceCitation,
        hideSourceOnScreen: caseConfig.hideSourceOnScreen,
        specimen: caseConfig.specimen,
        showOutro: caseConfig.showOutro,
        findNarrationPath: (sceneId) =>
          ttsOut?.durations[sceneId] !== undefined
            ? path.join(tmpDir, 'vo', `${sceneId}.wav`)
            : null,
        narrationDurationSec: (sceneId) => ttsOut!.durations[sceneId],
        // Real Whisper transcription isn't wired into a real job this pass
        // (see this file's own header) — compile() falls back to the
        // authored `captionText` when this returns null.
        transcribedWords: () => null,
      });
    }
    return { timelines, engine: 'remotion' };
  },
};

// ---- stills-kenburns ----

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const stillsKenburnsHandler: TemplateHandler = {
  async compileOutputs(ctx) {
    const { job, resolvedJob, tmpDir, storage, fetchFn, runner, deps } = ctx;
    const config = job.manifest.stillsKenburns;
    if (!config) {
      throw new Error('run-job: stills-kenburns jobs require manifest.stillsKenburns');
    }

    const parsed = deps.parseShotlistV2(config.shotlistText);

    const stillLocalPaths: Record<string, string> = {};
    for (const [shotId, filename] of Object.entries(config.stillImages)) {
      stillLocalPaths[shotId] = await downloadRawAsset(
        storage,
        job.id,
        shotId,
        filename,
        path.join(tmpDir, 'stills'),
        fetchFn,
      );
    }

    // Reuses the `tts` stage exactly like `case-file`'s handler, just
    // addressed by scene label ("S01") instead of a shot id — scenes with
    // no `vo_text` (silent connective beats) are skipped, matching
    // `compile()`'s own "no narration" handling.
    const ttsShots = parsed.scenes
      .filter((s) => s.vo_text)
      .map((s) => ({ id: `S${pad2(s.scene_n)}`, voiceover_text: s.vo_text! }));
    const stageJob: Job = {
      id: job.id,
      manifest: { ...job.manifest, shots: ttsShots },
      workDir: tmpDir,
    };
    runner.register(
      createTtsStage({
        synthesise: deps.synthesise,
        voice: resolvedJob.voice,
        speed: resolvedJob.speed,
      }),
    );
    const stageOutputs = await runner.run(stageJob);
    const ttsOut = stageOutputs.get('tts:') as { durations: Record<string, number> } | undefined;

    const timelines: Record<string, TimelineT> = {};
    for (const outputId of resolvedJob.outputs) {
      timelines[outputId] = deps.compileStillsKenburns({
        contentId: `${job.id}_${outputId}`,
        aspectRatio: config.aspectRatio,
        parsed,
        findStillPath: (sceneN, cut) => stillLocalPaths[`S${pad2(sceneN)}-${cut}`] ?? null,
        findVoPath: (sceneN) =>
          ttsOut?.durations[`S${pad2(sceneN)}`] !== undefined
            ? path.join(tmpDir, 'vo', `S${pad2(sceneN)}.wav`)
            : null,
        voDurationSec: (sceneN) => ttsOut!.durations[`S${pad2(sceneN)}`],
      });
    }
    return { timelines, engine: 'ffmpeg' };
  },
};

// ---- shorts-916 ----

// Ported from `assemble-short-rewrite.mjs`'s `synthPausedScene`, minus its
// Whisper word-timestamp pass on part 2 — same "not wired for real
// transcription this pass" gap this file's own header already flags for
// every other handler's captions. Without it, `hitOffsetInScene` can't
// name the exact word the musical hit should land on (the original script
// synced a "hit" cue to part 2's LAST spoken word specifically, e.g.
// "bar" in "over the bar"); this falls back to where part 2 *starts*
// instead — an honest approximation, not the original's precision, flagged
// here rather than silently matched.
async function synthPausedVo(
  parts: [string, string],
  pauseSec: number,
  synthesise: RunJobDeps['synthesise'],
  voice: string,
  speed: number,
  workDir: string,
  idx: number,
): Promise<ResolvedSceneVo> {
  await mkdir(workDir, { recursive: true });
  const part1 = await synthesise({ text: parts[0], voice, speed });
  const part2 = await synthesise({ text: parts[1], voice, speed });
  const part1Dur = probeDuration(part1.wavPath);

  const silencePath = path.join(workDir, `silence_${idx}.wav`);
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=24000:cl=mono',
    '-t',
    String(pauseSec),
    '-c:a',
    'pcm_s16le',
    silencePath,
  ]);

  const outPath = path.join(workDir, `paused_${idx}.wav`);
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    part1.wavPath,
    '-i',
    silencePath,
    '-i',
    part2.wavPath,
    '-filter_complex',
    '[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]',
    '-map',
    '[out]',
    '-c:a',
    'pcm_s16le',
    outPath,
  ]);

  return {
    path: outPath,
    durationSec: part1Dur + pauseSec + part2.durationSec,
    pauseStartInScene: part1Dur,
    hitOffsetInScene: part1Dur + pauseSec,
  };
}

const shorts916Handler: TemplateHandler = {
  async compileOutputs(ctx) {
    const { job, resolvedJob, tmpDir, storage, fetchFn, deps } = ctx;
    const config = job.manifest.shorts916;
    if (!config) {
      throw new Error('run-job: shorts-916 jobs require manifest.shorts916');
    }

    const imageLocalPaths: Record<string, string> = {};
    for (const [key, filename] of Object.entries(config.images)) {
      imageLocalPaths[key] = await downloadRawAsset(
        storage,
        job.id,
        key,
        filename,
        path.join(tmpDir, 'stills'),
        fetchFn,
      );
    }

    // No shared `assets`/`tts` `StageRunner` stage here, unlike every other
    // handler — those stages are keyed one-text-per-shot-id, and a
    // `vo_parts` scene needs two TTS calls plus real ffmpeg pause-concat
    // (`synthPausedVo` above), which doesn't fit that shape. Each scene's
    // VO is synthesised directly instead; this also means a retried job
    // resynthesises every scene's VO from scratch — a real gap, but not a
    // new one: the `tts` stage's own skip logic is already broken by
    // `tmpDir` deletion on every invocation (this file's own header).
    const voice = config.voice ?? resolvedJob.voice;
    const voDir = path.join(tmpDir, 'shorts-vo');
    const sceneVo: Record<number, ResolvedSceneVo> = {};
    for (let i = 0; i < config.scenes.length; i++) {
      const scene = config.scenes[i];
      const n = i + 1;
      if (scene.vo_parts) {
        if (scene.vo_parts.length !== 2) {
          throw new Error(
            `run-job: shorts-916 scene ${n} has ${scene.vo_parts.length} vo_parts, expected exactly 2`,
          );
        }
        sceneVo[n] = await synthPausedVo(
          [scene.vo_parts[0], scene.vo_parts[1]],
          scene.pause_sec ?? 1,
          deps.synthesise,
          voice,
          resolvedJob.speed,
          voDir,
          n,
        );
      } else if (scene.vo) {
        const { wavPath, durationSec } = await deps.synthesise({
          text: scene.vo,
          voice,
          speed: resolvedJob.speed,
        });
        sceneVo[n] = { path: wavPath, durationSec };
      }
    }

    const timelines: Record<string, TimelineT> = {};
    for (const outputId of resolvedJob.outputs) {
      timelines[outputId] = deps.compileShorts916({
        contentId: `${job.id}_${outputId}`,
        config,
        resolveImagePath: (key) => {
          const resolved = imageLocalPaths[key];
          if (!resolved) throw new Error(`run-job: no uploaded image for key "${key}"`);
          return resolved;
        },
        sceneVo,
        // Real Whisper transcription isn't wired into a real job this pass
        // (see this file's own header) — compile() renders a hook scene's
        // overlay from its own script text either way, and simply omits
        // word-synced caption overlays for a non-hook scene when this is
        // left empty.
      });
    }
    return { timelines, engine: 'ffmpeg' };
  },
};

const TEMPLATE_HANDLERS: Record<string, TemplateHandler> = {
  'clips-overlay': clipsOverlayHandler,
  'case-file': caseFileHandler,
  'stills-kenburns': stillsKenburnsHandler,
  'shorts-916': shorts916Handler,
};

export async function runJob(opts: RunJobOptions, deps: RunJobDeps, logger: Logger): Promise<void> {
  const job = await deps.jobsRepo.getById(opts.jobId);
  if (!job) throw new Error(`run-job: no job found with id "${opts.jobId}"`);

  const projectRow = await deps.projectsRepo.getById(job.project_id);
  if (!projectRow)
    throw new Error(`run-job: job "${job.id}" references missing project_id "${job.project_id}"`);
  const project: ProjectT = projectRow.config;

  const handler = TEMPLATE_HANDLERS[job.manifest.visual.mode];
  if (!handler) {
    throw new Error(
      `run-job: unsupported visual.mode "${job.manifest.visual.mode}" (expected one of ${Object.keys(TEMPLATE_HANDLERS).join(', ')})`,
    );
  }

  const resolvedJob = resolveJob(project, job.manifest);
  const storage = deps.createStorage(resolvedJob.providers.storage);
  const artifactsRepo = deps.createArtifactsRepo(job.org_id);
  const fetchFn = deps.fetchFn ?? fetch;

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `ss-run-job-${job.id}-`));
  try {
    await advanceToRunning(deps.jobsRepo, job, logger);

    const runner = new StageRunner(deps.createStageStore(job.org_id));
    const { timelines, engine } = await handler.compileOutputs({
      job,
      project,
      resolvedJob,
      tmpDir,
      storage,
      fetchFn,
      runner,
      deps,
      logger,
    });
    if (engine === 'ffmpeg' && !deps.renderFfmpeg) {
      throw new Error('run-job: this template needs deps.renderFfmpeg, none was supplied');
    }
    const render = engine === 'ffmpeg' ? deps.renderFfmpeg! : deps.render;
    const expectedFps = engine === 'ffmpeg' ? FFMPEG_FPS : REMOTION_FPS;

    const stageJob: Job = { id: job.id, manifest: job.manifest, workDir: tmpDir };
    const renderOutDir = path.join(tmpDir, 'out');
    const renderedVideoUrls: Record<string, string> = {};
    const outputLocalPaths: Record<string, string> = {};
    const outputExpected: Record<
      string,
      {
        durationSec: number;
        aspectRatio: string;
        highlights: Array<{ x: number; y: number; width: number; height: number }>;
        ignoreBlackAfterSec?: number;
      }
    > = {};
    for (const [outputId, timeline] of Object.entries(timelines)) {
      const localPath = await render(timeline, { outputDir: renderOutDir });
      outputLocalPaths[outputId] = localPath;
      // Real bug found running this for real (P3.6, 2026-09-24): the
      // actual rendered duration also includes `timeline.cta`'s own
      // duration (the end card) — `ClipsOverlay.tsx`'s own
      // `totalClipsOverlayFrames()` adds it separately from
      // `scenes[].durationSecs`, so omitting it here made every real
      // render "fail" QA's duration check by exactly the end card's length.
      const scenesDurationSec = timeline.scenes.reduce((sum, s) => sum + s.durationSecs, 0);
      const ctaDurationSec = timeline.cta?.durationSecs ?? 0;
      // Real bug found running the case-file handler for real (P3.7,
      // 2026-09-24): `CaseFile.tsx`'s own `totalCaseFileFrames()` adds a
      // fixed 2.5s outro card (`OUTRO_FRAMES = 75` @ 30fps) whenever
      // `caseMeta.showOutro` is set (the default) — a real duration this
      // template's Timeline carries no dedicated field for (`case-file`
      // has no `cta`), so it needs its own check here, same treatment as
      // clips-overlay's `cta` just above.
      const outroDurationSec =
        timeline.template === 'case-file' && timeline.caseMeta?.showOutro !== false ? 2.5 : 0;
      const extraDurationSec = ctaDurationSec + outroDurationSec;
      outputExpected[outputId] = {
        durationSec: scenesDurationSec + extraDurationSec,
        aspectRatio: timeline.aspectRatio,
        highlights: timeline.scenes.flatMap((s) => s.highlights ?? []),
        // The end card (`EndCard.tsx`) is a deliberately near-black
        // (`#0B0B0F`) closing frame — `blackdetect` can't tell that apart
        // from an actual broken/missing-asset frame by darkness alone, and
        // the first real run of this wiring flagged exactly that.
        // Only `clips-overlay`'s own end card is near-black by design
        // (`#0B0B0F`) — `case-file`'s outro card is navy (`#1E3A5F`), real
        // enough content that a genuine black-frame defect there should
        // still fail, so `ctaDurationSec` alone gates this, not the wider
        // `extraDurationSec`.
        ignoreBlackAfterSec: ctaDurationSec > 0 ? scenesDurationSec : undefined,
      };
      const key = `jobs/${job.id}/rendered/${outputId}.mp4`;
      const { url } = await storage.put({ localPath, key });
      await artifactsRepo.record(job.id, 'render', 'video', url, { outputId });
      logger.info(`uploaded ${outputId}`, { url });

      const platform = OUTPUT_TO_PLATFORM[outputId];
      if (platform) renderedVideoUrls[platform] = url;
    }

    // QA runs for every output before gates/publish — a failure here marks
    // the whole job `failed`, the same as any other stage failure, and
    // blocks both the gates transition and publish below.
    runner.register(
      createQaStage({
        measure: (outputId) => deps.measureVideo(outputLocalPaths[outputId]),
        detectBlackFrames: (outputId) => deps.detectBlackFrames(outputLocalPaths[outputId]),
        expected: (outputId) => {
          const canonical =
            CANONICAL_RESOLUTION[outputExpected[outputId].aspectRatio] ??
            CANONICAL_RESOLUTION['9:16'];
          return {
            durationSec: outputExpected[outputId].durationSec,
            width: canonical.width,
            height: canonical.height,
            fps: expectedFps,
            targetLufs: project.qa.targetLufs,
            maxTruePeakDb: project.qa.maxTruePeakDb,
            highlights: outputExpected[outputId].highlights,
            ignoreBlackAfterSec: outputExpected[outputId].ignoreBlackAfterSec,
          };
        },
        visionCheck:
          project.qa.visionCheck && deps.visionCheck
            ? (outputId) => deps.visionCheck!(outputLocalPaths[outputId])
            : undefined,
      }),
    );
    await runner.run(stageJob);

    // Publish only fires for a gate-free job — see this file's own header
    // for why a gated job stops at `awaiting_review` instead.
    if (resolvedJob.gates.length === 0 && job.manifest.publish.length > 0) {
      const publishTargets: Record<string, string> = {};
      for (const target of project.publishTargets) {
        publishTargets[target.platform] = target.credentialRef;
      }

      const publish: PublishFn = async (args) => {
        const credentialRef = publishTargets[args.platform];
        // createPublishStage itself already throws a clearer error when a
        // platform has no configured publishTarget at all — this can only
        // be reached once that check has already passed.
        return deps.createPublishProviderFor(args.platform, credentialRef).post(args);
      };

      runner.register(createPublishStage({ publish, publishTargets, renderedVideoUrls }));
      const publishOutputs = await runner.run(stageJob);
      const posts = publishOutputs.get('publish:') as
        { posts: Record<string, { postId: string; url?: string }> } | undefined;
      if (posts) {
        for (const [platform, post] of Object.entries(posts.posts)) {
          await artifactsRepo.record(job.id, 'publish', 'post', post.url ?? post.postId, {
            platform,
            postId: post.postId,
          });
          logger.info(`published ${platform}`, post);
        }
      }
    }

    if (resolvedJob.gates.length > 0) {
      const next = `awaiting_review:${resolvedJob.gates[0]}` as JobStatus;
      assertJobTransition('running', next);
      await deps.jobsRepo.updateStatus(job.id, next);
      logger.info('job running -> awaiting_review (gates present, not evaluated)', {
        gates: resolvedJob.gates,
      });
    } else {
      assertJobTransition('running', 'delivered');
      await deps.jobsRepo.updateStatus(job.id, 'delivered');
      logger.info('job running -> delivered');
    }
  } catch (err) {
    await deps.jobsRepo.updateStatus(job.id, 'failed');
    throw err;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
