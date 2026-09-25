import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createTtsStage, type TtsSynthesiser } from './tts.ts';
import { StageRunner, type Job, type JobStageStore, type StageRunRecord } from '../runner/index.ts';

function makeFakeStore() {
  const runs = new Map<string, StageRunRecord>();
  const store: JobStageStore = {
    async getLastRun(jobId, stage, outputId) {
      return runs.get(`${jobId}:${stage}:${outputId ?? ''}`) ?? null;
    },
    async recordStart() {},
    async recordEnd(jobId, stage, result, outputId) {
      runs.set(`${jobId}:${stage}:${outputId ?? ''}`, {
        hash: result.hash,
        status: result.status,
        outputs: result.outputs,
      });
    },
    async log() {},
  };
  return store;
}

async function withTmpDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tts-stage-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function job(workDir: string, shots: Array<{ id: string; voiceover_text?: string }>): Job {
  return { id: 'job-1', workDir, manifest: { outputs: ['fb'], shots } };
}

test('tts stage: synthesises voiceover_text shots, skips shots without one', async () => {
  await withTmpDir(async (workDir) => {
    const sourceWav = path.join(workDir, 'source.wav');
    await writeFile(sourceWav, 'fake-wav-bytes');

    let calls = 0;
    const synthesise: TtsSynthesiser = async () => {
      calls++;
      return { wavPath: sourceWav, durationSec: 2.5 };
    };

    const stage = createTtsStage({ synthesise, voice: 'bm_george', speed: 1 });
    const theJob = job(workDir, [
      { id: 's1', voiceover_text: 'A fact about octopuses.' },
      { id: 's2' }, // no narration — should be skipped entirely
    ]);

    const result = await stage.run({ job: theJob, cancelled: () => false });

    assert.equal(calls, 1);
    assert.deepEqual(result?.outputs, { durations: { s1: 2.5 } });
    assert.equal(await readFile(path.join(workDir, 'vo', 's1.wav'), 'utf8'), 'fake-wav-bytes');
  });
});

test('tts stage: inputsHash changes with text/voice/speed, stable otherwise', async () => {
  const stage = createTtsStage({
    synthesise: (async () => ({ wavPath: '', durationSec: 1 })) as TtsSynthesiser,
    voice: 'bm_george',
    speed: 1,
  });
  const base = job('/tmp/x', [{ id: 's1', voiceover_text: 'hello' }]);
  const sameAgain = job('/tmp/x', [{ id: 's1', voiceover_text: 'hello' }]);
  const differentText = job('/tmp/x', [{ id: 's1', voiceover_text: 'goodbye' }]);

  assert.equal(stage.inputsHash(base), stage.inputsHash(sameAgain));
  assert.notEqual(stage.inputsHash(base), stage.inputsHash(differentText));

  const differentVoiceStage = createTtsStage({
    synthesise: (async () => ({ wavPath: '', durationSec: 1 })) as TtsSynthesiser,
    voice: 'am_michael',
    speed: 1,
  });
  assert.notEqual(stage.inputsHash(base), differentVoiceStage.inputsHash(base));
});

test('tts stage: no shots have voiceover_text -> empty durations, synthesise never called', async () => {
  await withTmpDir(async (workDir) => {
    let calls = 0;
    const synthesise: TtsSynthesiser = async () => {
      calls++;
      return { wavPath: '', durationSec: 0 };
    };
    const stage = createTtsStage({ synthesise, voice: 'bm_george', speed: 1 });
    const result = await stage.run({ job: job(workDir, [{ id: 's1' }]), cancelled: () => false });

    assert.equal(calls, 0);
    assert.deepEqual(result?.outputs, { durations: {} });
  });
});

test('P4.1: a real bug — a "done" record whose hash still matches but whose synthesised wav file is missing (a fresh workDir on retry) re-runs instead of leaving a hole for compile() to hit ENOENT on', async () => {
  await withTmpDir(async (workDir) => {
    const sourceWav = path.join(workDir, 'source.wav');
    await writeFile(sourceWav, 'fake-wav-bytes');

    let calls = 0;
    const synthesise: TtsSynthesiser = async () => {
      calls += 1;
      return { wavPath: sourceWav, durationSec: 2.5 };
    };

    const store = makeFakeStore();
    const stage = createTtsStage({ synthesise, voice: 'bm_george', speed: 1 });
    const theJob = job(workDir, [{ id: 's1', voiceover_text: 'A fact about octopuses.' }]);

    // Same simulated scenario as `assets.test.ts`'s own P4.1 test: a real
    // "done" record already exists (matching hash) from an earlier
    // invocation, but this run's workDir has never actually had the tts
    // stage write `vo/s1.wav` into it.
    const hash = stage.inputsHash(theJob);
    await store.recordEnd('job-1', 'tts', {
      hash,
      status: 'done',
      outputs: { durations: { s1: 2.5 } },
    });
    assert.equal(existsSync(path.join(workDir, 'vo', 's1.wav')), false);

    const runner = new StageRunner(store).register(stage);
    await runner.run(theJob);

    assert.equal(calls, 1);
    assert.equal(existsSync(path.join(workDir, 'vo', 's1.wav')), true);
  });
});

test('P4.1: verifySkip only checks shots that actually have voiceover_text', async () => {
  await withTmpDir(async (workDir) => {
    await mkdir(path.join(workDir, 'vo'), { recursive: true });
    const stage = createTtsStage({
      synthesise: (async () => ({ wavPath: '', durationSec: 1 })) as TtsSynthesiser,
      voice: 'bm_george',
      speed: 1,
    });
    // s1 has no voiceover_text at all — verifySkip must not require a
    // vo/s1.wav file that was never supposed to exist in the first place.
    const theJob = job(workDir, [{ id: 's1' }]);
    const stillValid = await stage.verifySkip!(
      { durations: {} },
      {
        job: theJob,
        cancelled: () => false,
      },
    );
    assert.equal(stillValid, true);
  });
});
