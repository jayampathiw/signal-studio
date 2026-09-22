import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createAssetsStage } from '@signal-studio/core/stages/assets';
import { createTtsStage, type TtsSynthesiser } from '@signal-studio/core/stages/tts';
import { resolveJob } from '@signal-studio/core/resolve';
import { StageRunner, type Job, type JobStageStore } from '@signal-studio/core/runner';
import { assertJobTransition, type JobStatus } from '@signal-studio/core/state';
import type { TimelineT, ProjectT } from '@signal-studio/core/schemas';
import type { ArtifactsRepo, JobRow, JobsRepo, ProjectsRepo } from '@signal-studio/db/repos';
import type { StorageProvider } from '@signal-studio/providers/contracts';

import type { Logger } from '../logger.ts';

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
    for (const outputId of resolvedJob.outputs) {
      const timeline = deps.compileClipsOverlay(resolvedJob, {
        contentId: `${job.id}_${outputId}`,
        outputId,
        shotAssets,
        shotVoiceovers,
      });
      const localPath = await deps.render(timeline, { outputDir: renderOutDir });
      const key = `jobs/${job.id}/rendered/${outputId}.mp4`;
      const { url } = await storage.put({ localPath, key });
      await artifactsRepo.record(job.id, 'render', 'video', url, { outputId });
      logger.info(`uploaded ${outputId}`, { url });
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
