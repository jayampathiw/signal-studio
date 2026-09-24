import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveJob } from '@signal-studio/core/resolve';
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

import type { Logger } from '../logger.ts';

// **Deliberate, flagged convention**: `Timeline.aspectRatio` names a ratio,
// not pixels — nothing else in `timeline.v1`/`manifest.v1` pins the actual
// canonical resolution per ratio, so the `qa` stage's "resolution" check
// needs its own explicit mapping. `fps: 30` is specific to this file's own
// `clips-overlay`-via-Remotion path (every real golden reference rendered
// through `render-remotion` in this repo measures 30fps) — a future
// ffmpeg-engine template wired into a real job would need its own 25fps
// expectation here, not this same constant.
const CANONICAL_RESOLUTION: Record<string, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};
const EXPECTED_FPS = 30;

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
 * P2.5 — `ss run-job --id`: the DB-backed counterpart to `run-local`. Same
 * stage registration (`assets` + `tts`) and `clips-overlay`-only `compile()`
 * call (see `run-local.ts`'s header for why `compilation` isn't supported by
 * either command yet), but reads/writes real rows and real object storage
 * instead of local files.
 *
 * **Real gap this surfaces, not silently worked around**: there is no
 * "upload a job's raw clips" step anywhere yet except this command's own
 * sibling, `ss upload` — nothing auto-ingests a shot's clip into storage.
 * This command downloads each shot's raw clip from
 * `jobs/<jobId>/uploads/<shotId>/<clip>` (the key convention `ss upload`
 * writes to) via `storage.signedUrl()` + `fetch()` (the `StorageProvider`
 * contract has no direct "get" method, and doesn't need one just for this —
 * a signed GET URL is exactly what an unauthenticated `fetch` needs). If
 * nothing was uploaded there yet, this fails with a clear message telling
 * the caller to run `ss upload` first, rather than silently producing an
 * empty render.
 *
 * **Also flagged, not implemented**: real gate evaluation. `manifest.gates`
 * names *which* gates apply (per `manifest.v1.ts`'s own comment, "the actual
 * gate logic lives in packages/providers" — not built yet). This command
 * only marks a job `awaiting_review:<firstGate>` when gates are present,
 * exactly as the state machine's own transition table allows; it does not
 * evaluate anything.
 *
 * **P3.5's "not wired" gap closed here**: once every output has rendered,
 * and only when the job has *no* gates (a gated job stops at
 * `awaiting_review:<gate>` — publishing before a human review clears would
 * defeat the point of the gate, and no real gate-approval path exists yet
 * to unblock it from there), this registers `createPublishStage()` on the
 * same `StageRunner` and runs it. `publish` dispatches each
 * `manifest.publish[]` platform to a real `PublishProvider` (`deps.
 * createPublishProviderFor`), resolving each platform's `pageRef` from
 * `project.publishTargets[]` and each platform's rendered video URL from
 * `OUTPUT_TO_PLATFORM`'s reverse of the outputId it was just uploaded
 * under. Re-registering on the *same* runner (rather than a fresh one)
 * means the stage store's usual "skip if inputs unchanged" behavior also
 * covers publish — a retried job with nothing new to publish won't
 * double-post.
 *
 * **P3.6's `qa` stage runs right after every output renders, before the
 * gates/publish decision** — a QA failure marks the job `failed` the same
 * way any other stage failure does, so it blocks both a gated job's
 * `awaiting_review` transition and a gate-free job's publish. `measure`/
 * `detectBlackFrames`/`visionCheck` are real ffprobe/ffmpeg/Anthropic calls
 * (`deps`, wired in `apps/worker/src/qa-measure.ts`/`qa-vision.ts`) against
 * the *local* rendered file still on disk from this same run — no need to
 * re-download from R2 for a check that just happened to produce the file
 * it's checking. `visionCheck` is only passed through to the stage at all
 * when `project.qa.visionCheck` is set; otherwise it's omitted entirely.
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
    resolvedJob: ReturnType<typeof resolveJob>,
    params: {
      contentId: string;
      outputId: string;
      shotAssets: Record<string, { clipPath: string; durationS: number }>;
      shotVoiceovers: Record<string, { path: string; durationS: number }>;
    },
  ) => TimelineT;
  render: (timeline: TimelineT, opts: { outputDir: string }) => Promise<string>;
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

async function downloadRawClip(
  storage: StorageProvider,
  jobId: string,
  shotId: string,
  clip: string,
  destDir: string,
  fetchFn: typeof fetch,
): Promise<void> {
  const key = `jobs/${jobId}/uploads/${shotId}/${clip}`;
  const url = await storage.signedUrl(key);
  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(
      `run-job: raw clip not found for shot "${shotId}" (${key}) — run \`ss upload --job ${jobId} --shot ${shotId} --file <clip>\` first`,
    );
  }
  const dest = path.join(destDir, clip);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

export async function runJob(opts: RunJobOptions, deps: RunJobDeps, logger: Logger): Promise<void> {
  const job = await deps.jobsRepo.getById(opts.jobId);
  if (!job) throw new Error(`run-job: no job found with id "${opts.jobId}"`);

  const projectRow = await deps.projectsRepo.getById(job.project_id);
  if (!projectRow)
    throw new Error(`run-job: job "${job.id}" references missing project_id "${job.project_id}"`);
  const project: ProjectT = projectRow.config;

  if (job.manifest.visual.mode !== 'clips-overlay') {
    throw new Error(
      `run-job: only "clips-overlay" is supported today; got visual.mode="${job.manifest.visual.mode}" (see this file's header)`,
    );
  }

  const resolvedJob = resolveJob(project, job.manifest);
  const storage = deps.createStorage(resolvedJob.providers.storage);
  const artifactsRepo = deps.createArtifactsRepo(job.org_id);
  const fetchFn = deps.fetchFn ?? fetch;

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `ss-run-job-${job.id}-`));
  try {
    await advanceToRunning(deps.jobsRepo, job, logger);

    for (const shot of job.manifest.shots) {
      if (!shot.clip) continue;
      await downloadRawClip(
        storage,
        job.id,
        shot.id,
        shot.clip,
        path.join(tmpDir, 'clips', 'raw'),
        fetchFn,
      );
    }

    const stageJob: Job = { id: job.id, manifest: job.manifest, workDir: tmpDir };
    const runner = new StageRunner(deps.createStageStore(job.org_id))
      .register(createAssetsStage())
      .register(
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
    for (const outputId of resolvedJob.outputs) {
      const timeline = deps.compileClipsOverlay(resolvedJob, {
        contentId: `${job.id}_${outputId}`,
        outputId,
        shotAssets,
        shotVoiceovers,
      });
      const localPath = await deps.render(timeline, { outputDir: renderOutDir });
      outputLocalPaths[outputId] = localPath;
      // Real bug found running this for real (P3.6, 2026-09-24): the
      // actual rendered duration also includes `timeline.cta`'s own
      // duration (the end card) — `ClipsOverlay.tsx`'s own
      // `totalClipsOverlayFrames()` adds it separately from
      // `scenes[].durationSecs`, so omitting it here made every real
      // render "fail" QA's duration check by exactly the end card's length.
      const scenesDurationSec = timeline.scenes.reduce((sum, s) => sum + s.durationSecs, 0);
      const ctaDurationSec = timeline.cta?.durationSecs ?? 0;
      outputExpected[outputId] = {
        durationSec: scenesDurationSec + ctaDurationSec,
        aspectRatio: timeline.aspectRatio,
        highlights: timeline.scenes.flatMap((s) => s.highlights ?? []),
        // The end card (`EndCard.tsx`) is a deliberately near-black
        // (`#0B0B0F`) closing frame — `blackdetect` can't tell that apart
        // from an actual broken/missing-asset frame by darkness alone, and
        // the first real run of this wiring flagged exactly that.
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
            fps: EXPECTED_FPS,
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
