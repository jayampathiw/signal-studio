import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createAssetsStage } from '@signal-studio/core/stages/assets';
import { createTtsStage, type TtsSynthesiser } from '@signal-studio/core/stages/tts';
import { Manifest, Project, type TimelineT } from '@signal-studio/core/schemas';
import { resolveJob } from '@signal-studio/core/resolve';
import { StageRunner, type Job, type JobStageStore } from '@signal-studio/core/runner';

import type { Logger } from '../logger.ts';

/**
 * P2.5 — `ss run-local --manifest --project --out`: no DB, no queue. Loads a
 * manifest + project from local files, runs the `assets`/`tts` stages
 * against a local `workDir`, compiles a Timeline per manifest output, and
 * renders each to `--out`. This is the "does the whole pipeline actually
 * work" command — `ss run-job` (DB-backed) reuses the exact same stage
 * registration and compile/render logic, just swapping the store and where
 * inputs/outputs live.
 *
 * **Only `clips-overlay` is supported here, not `compilation`** — flagged
 * rather than silently unsupported: `compilation`'s `compile()` takes
 * *already-rendered* episode Timelines as input (see
 * `packages/templates/compilation/src/compile.ts`'s own header), which by
 * definition means the episodes were each their own prior job. A single
 * local manifest+project invocation has nothing to compile a compilation
 * from. Compiling a real compilation is `ss run-job`'s concern once multiple
 * episode jobs exist in the DB — not implemented in this pass either (same
 * "no artifact-loading mechanism exists yet" gap noted in P2.2's compile()).
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
  render: (timeline: TimelineT, opts: { outputDir: string }) => Promise<string>;
};

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

export async function runLocal(
  opts: RunLocalOptions,
  deps: RunLocalDeps,
  logger: Logger,
): Promise<{ outputs: Record<string, string> }> {
  const manifest = Manifest.parse(JSON.parse(await readFile(opts.manifestPath, 'utf8')));
  const project = Project.parse(JSON.parse(await readFile(opts.projectPath, 'utf8')));
  const resolvedJob = resolveJob(project, manifest);

  if (manifest.visual.mode !== 'clips-overlay') {
    throw new Error(
      `run-local: only "clips-overlay" is supported today; got visual.mode="${manifest.visual.mode}" (see this file's header for why "compilation" can't work from a single local manifest)`,
    );
  }

  const workDir = opts.workDir ?? path.dirname(path.resolve(opts.manifestPath));
  const contentId = opts.contentId ?? path.basename(workDir);

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
