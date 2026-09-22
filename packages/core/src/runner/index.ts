/**
 * Stage runner (P1.3). Runs an ordered registry of StageDefinitions for a
 * job, skipping stages whose inputs are unchanged from the last `done` run
 * (hash-keyed), writing job_stages rows and streaming job_log via the
 * injected `store` (packages/db's repos implement this in P1.5+ — this
 * package doesn't depend on @signal-studio/db to avoid a cycle).
 */

export type Job = {
  id: string;
  manifest: { outputs: string[]; [key: string]: unknown };
  [key: string]: unknown;
};

export type StageContext = {
  job: Job;
  outputId?: string;
  cancelled: () => boolean;
};

export type StageDefinition = {
  name: string;
  // Multi-output stages (compile/render) are called once per manifest
  // output when `multiOutput` is true; ctx.outputId is set accordingly.
  multiOutput?: boolean;
  inputsHash: (job: Job) => string;
  run: (ctx: StageContext) => Promise<{ outputs?: unknown; warnings?: string[] } | void>;
};

export type StageRunRecord = {
  hash: string;
  status: 'done' | 'failed';
  // P2.5 addition: without this, a caller composing one stage's output into
  // the next (e.g. the `assets` stage's measured clip durations feeding
  // `compile()`) has no way to read it back once the stage is *skipped*
  // (unchanged hash) — only a fresh run's `result.outputs` was ever
  // reachable before. Optional so implementations/fakes written before this
  // addition (this file's own tests, `JobStagesRepo` pre-P2.5) don't need to
  // change to keep compiling; `run()` below treats a missing value the same
  // as "no outputs to hand back on skip".
  outputs?: unknown;
};

export type JobStageStore = {
  getLastRun: (
    jobId: string,
    stageName: string,
    outputId?: string,
  ) => Promise<StageRunRecord | null>;
  recordStart: (jobId: string, stageName: string, outputId?: string) => Promise<void>;
  recordEnd: (
    jobId: string,
    stageName: string,
    result: { hash: string; status: 'done' | 'failed'; outputs?: unknown; warnings?: string[] },
    outputId?: string,
  ) => Promise<void>;
  log: (jobId: string, stageName: string, message: string) => Promise<void>;
};

export class CancelledError extends Error {
  constructor(stage: string) {
    super(`Job cancelled before stage "${stage}"`);
    this.name = 'CancelledError';
  }
}

export class StageRunner {
  private stages: StageDefinition[] = [];
  private store: JobStageStore;

  constructor(store: JobStageStore) {
    this.store = store;
  }

  register(stage: StageDefinition): this {
    this.stages.push(stage);
    return this;
  }

  // Returns every stage's outputs (fresh or recovered from a skip), keyed
  // `${stageName}:${outputId ?? ''}` — the same composite key the store
  // itself keys runs by. Callers that need to feed one stage's output into
  // the next (e.g. `ss run-local`/`ss run-job` building `compile()`'s
  // `shotAssets` from the `assets` stage) read this instead of re-deriving
  // it, so it's always correct whether or not the stage actually re-ran.
  async run(job: Job, cancelled: () => boolean = () => false): Promise<Map<string, unknown>> {
    const outputs = new Map<string, unknown>();

    for (const stage of this.stages) {
      const outputIds = stage.multiOutput ? job.manifest.outputs : [undefined];

      for (const outputId of outputIds) {
        if (cancelled()) throw new CancelledError(stage.name);

        const key = `${stage.name}:${outputId ?? ''}`;
        const hash = stage.inputsHash(job);
        const last = await this.store.getLastRun(job.id, stage.name, outputId);

        if (last && last.status === 'done' && last.hash === hash) {
          await this.store.log(job.id, stage.name, `skipped (unchanged, hash=${hash})`);
          if (last.outputs !== undefined) outputs.set(key, last.outputs);
          continue;
        }

        await this.store.recordStart(job.id, stage.name, outputId);
        await this.store.log(job.id, stage.name, `running (hash=${hash})`);

        try {
          const result = await stage.run({ job, outputId, cancelled });
          if (result?.outputs !== undefined) outputs.set(key, result.outputs);
          await this.store.recordEnd(
            job.id,
            stage.name,
            { hash, status: 'done', outputs: result?.outputs, warnings: result?.warnings },
            outputId,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.store.recordEnd(job.id, stage.name, { hash, status: 'failed' }, outputId);
          await this.store.log(job.id, stage.name, `failed: ${message}`);
          throw err;
        }
      }
    }

    return outputs;
  }
}
