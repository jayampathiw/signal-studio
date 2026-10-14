import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { createAssetsStage, MissingAssetsError } from './assets.ts';
import { StageRunner, type Job, type JobStageStore, type StageRunRecord } from '../runner/index.ts';

const execFileAsync = promisify(execFile);

// Deliberately mismatched source resolutions/fps, same technique P0.1's
// golden tooling and the pilot's own P0.8-03 gate used, to actually exercise
// normalisation rather than trivially pass on already-correct input.
async function makeSyntheticClip(outPath: string, size: string, fps: number, durationS: number) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${size}:rate=${fps}:duration=${durationS}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationS}`,
    '-shortest',
    '-pix_fmt',
    'yuv420p',
    outPath,
  ]);
}

function job(workDir: string, shots: Array<{ id: string; clip: string; strip?: boolean }>): Job {
  return {
    id: 'job-1',
    workDir,
    manifest: {
      outputs: ['fb'],
      shots: shots.map((s) => ({
        id: s.id,
        clip: s.clip,
        audio: { strip_native_audio: s.strip ?? false },
      })),
    },
  };
}

function makeFakeStore() {
  const runs = new Map<string, StageRunRecord>();
  const store: JobStageStore = {
    async getLastRun(jobId, stage, outputId) {
      return runs.get(`${jobId}:${stage}:${outputId ?? ''}`) ?? null;
    },
    async recordStart() {},
    async recordEnd(jobId, stage, result, outputId) {
      runs.set(`${jobId}:${stage}:${outputId ?? ''}`, { hash: result.hash, status: result.status });
    },
    async log() {},
  };
  return store;
}

test('assets stage: normalises mismatched clips, writes QA sheets, returns durations', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'assets-stage-test-'));
  try {
    const rawDir = path.join(tmp, 'clips', 'raw');
    await mkdir(rawDir, { recursive: true });
    await makeSyntheticClip(path.join(rawDir, 's1.mp4'), '640x480', 24, 2);
    await makeSyntheticClip(path.join(rawDir, 's2.mp4'), '1080x1920', 30, 1.5);

    const stage = createAssetsStage();
    const theJob = job(tmp, [
      { id: 's1', clip: 's1.mp4' },
      { id: 's2', clip: 's2.mp4', strip: true },
    ]);

    const result = await stage.run({ job: theJob, cancelled: () => false });

    // Normalised output exists and matches the target spec.
    const outFile = path.join(tmp, 'clips', 's1.mp4');
    assert.ok(existsSync(outFile));
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,avg_frame_rate,pix_fmt',
      '-of',
      'json',
      outFile,
    ]);
    const probe = JSON.parse(stdout).streams[0];
    assert.equal(probe.width, 1080);
    assert.equal(probe.height, 1920);
    assert.equal(probe.avg_frame_rate, '30/1');
    assert.equal(probe.pix_fmt, 'yuv420p');

    // strip_native_audio=true → no audio stream on s2's normalised output.
    const { stdout: s2Streams } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_type',
      '-of',
      'json',
      path.join(tmp, 'clips', 's2.mp4'),
    ]);
    assert.deepEqual(
      JSON.parse(s2Streams).streams.map((s: { codec_type: string }) => s.codec_type),
      ['video'],
    );

    // QA contact sheets exist for both shots.
    assert.ok(existsSync(path.join(tmp, 'qa', 's1.png')));
    assert.ok(existsSync(path.join(tmp, 'qa', 's2.png')));

    // Durations reported back.
    const outputs = result?.outputs as { durations: Record<string, number> };
    assert.ok(outputs.durations.s1 > 1.9 && outputs.durations.s1 < 2.1);
    assert.ok(outputs.durations.s2 > 1.4 && outputs.durations.s2 < 1.6);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('assets stage: idempotent — a second run skips already-normalised clips', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'assets-stage-test-'));
  try {
    const rawDir = path.join(tmp, 'clips', 'raw');
    await mkdir(rawDir, { recursive: true });
    await makeSyntheticClip(path.join(rawDir, 's1.mp4'), '640x480', 24, 1);

    const stage = createAssetsStage();
    const theJob = job(tmp, [{ id: 's1', clip: 's1.mp4' }]);

    await stage.run({ job: theJob, cancelled: () => false });
    const outFile = path.join(tmp, 'clips', 's1.mp4');
    const mtimeAfterFirst = (await stat(outFile)).mtimeMs;

    await new Promise((r) => setTimeout(r, 50));
    await stage.run({ job: theJob, cancelled: () => false });
    const mtimeAfterSecond = (await stat(outFile)).mtimeMs;

    assert.equal(
      mtimeAfterFirst,
      mtimeAfterSecond,
      're-running should not re-normalise an unchanged clip',
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('assets stage: throws MissingAssetsError listing every missing clip, normalises nothing', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'assets-stage-test-'));
  try {
    const rawDir = path.join(tmp, 'clips', 'raw');
    await mkdir(rawDir, { recursive: true });
    await makeSyntheticClip(path.join(rawDir, 's1.mp4'), '640x480', 24, 1);
    // s2.mp4 deliberately not created.

    const stage = createAssetsStage();
    const theJob = job(tmp, [
      { id: 's1', clip: 's1.mp4' },
      { id: 's2', clip: 's2.mp4' },
    ]);

    await assert.rejects(
      () => stage.run({ job: theJob, cancelled: () => false }),
      (err: unknown) => {
        assert.ok(err instanceof MissingAssetsError);
        assert.deepEqual(
          err.missing.map((m) => m.shotId),
          ['s2'],
        );
        return true;
      },
    );
    // Fails loudly up front — s1 was never normalised either.
    assert.equal(existsSync(path.join(tmp, 'clips', 's1.mp4')), false);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('assets stage: inputsHash changes when a shot clip or strip flag changes', () => {
  const stage = createAssetsStage();
  const base = job('/tmp/x', [{ id: 's1', clip: 's1.mp4' }]);
  const sameClip = job('/tmp/x', [{ id: 's1', clip: 's1.mp4' }]);
  const diffClip = job('/tmp/x', [{ id: 's1', clip: 's1-v2.mp4' }]);
  const diffStrip = job('/tmp/x', [{ id: 's1', clip: 's1.mp4', strip: true }]);

  assert.equal(stage.inputsHash(base), stage.inputsHash(sameClip));
  assert.notEqual(stage.inputsHash(base), stage.inputsHash(diffClip));
  assert.notEqual(stage.inputsHash(base), stage.inputsHash(diffStrip));
});

test('P4.1: a real bug — a "done" record whose hash still matches but whose processed clip file is missing (a fresh workDir on retry) re-runs instead of leaving a hole for compile() to hit ENOENT on', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'assets-stage-verify-skip-test-'));
  try {
    const rawDir = path.join(tmp, 'clips', 'raw');
    await mkdir(rawDir, { recursive: true });
    await makeSyntheticClip(path.join(rawDir, 's1.mp4'), '640x480', 24, 1);

    const store = makeFakeStore();
    const stage = createAssetsStage();
    const theJob = job(tmp, [{ id: 's1', clip: 's1.mp4' }]);

    // Simulate exactly what a retried `ss run-job` sees: a real "done"
    // record already exists in the (durable) DB-backed store from an
    // earlier invocation, matching this job's real hash — but this run's
    // (fresh) workDir has never had the assets stage actually execute in
    // it, so `clips/s1.mp4` doesn't exist yet, only `clips/raw/s1.mp4`.
    const hash = stage.inputsHash(theJob);
    await store.recordEnd('job-1', 'assets', {
      hash,
      status: 'done',
      outputs: { durations: { s1: 1 } },
    });
    assert.equal(existsSync(path.join(tmp, 'clips', 's1.mp4')), false);

    const runner = new StageRunner(store).register(stage);
    const outputs = await runner.run(theJob);

    // The stage actually ran (not a trusted-but-wrong skip) — real output
    // file now exists, with a real measured duration.
    assert.equal(existsSync(path.join(tmp, 'clips', 's1.mp4')), true);
    const returned = outputs.get('assets:') as { durations: Record<string, number> };
    assert.ok(returned.durations.s1 > 0);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('assets stage: wired into StageRunner, a second run with unchanged manifest is skipped entirely', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'assets-stage-test-'));
  try {
    const rawDir = path.join(tmp, 'clips', 'raw');
    await mkdir(rawDir, { recursive: true });
    await makeSyntheticClip(path.join(rawDir, 's1.mp4'), '640x480', 24, 1);

    const store = makeFakeStore();
    const runner = new StageRunner(store).register(createAssetsStage());
    const theJob = job(tmp, [{ id: 's1', clip: 's1.mp4' }]);

    await runner.run(theJob);
    const outFile = path.join(tmp, 'clips', 's1.mp4');
    const mtimeAfterFirst = (await stat(outFile)).mtimeMs;

    await new Promise((r) => setTimeout(r, 50));
    await runner.run(theJob);
    const mtimeAfterSecond = (await stat(outFile)).mtimeMs;

    assert.equal(mtimeAfterFirst, mtimeAfterSecond);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
