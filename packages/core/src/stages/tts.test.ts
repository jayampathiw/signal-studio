import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createTtsStage, type TtsSynthesiser } from './tts.ts';
import type { Job } from '../runner/index.ts';

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
