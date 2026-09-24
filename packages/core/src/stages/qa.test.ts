import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createQaStage, QaFailedError, type QaExpected, type QaMeasurement } from './qa.ts';
import type { Job } from '../runner/index.ts';

const job: Job = { id: 'job-1', workDir: '/tmp/job-1', manifest: { outputs: ['fb'] } };

const goodMeasurement: QaMeasurement = {
  durationSec: 25.5,
  width: 1080,
  height: 1920,
  fps: 30,
  integratedLufs: -17.0,
  truePeakDb: -3.6,
};

const goodExpected: QaExpected = {
  durationSec: 25.6,
  width: 1080,
  height: 1920,
  fps: 30,
  targetLufs: -14,
  maxTruePeakDb: -1.0,
  highlights: [],
};

test('qa stage: all checks pass on a clean, matching render', async () => {
  const stage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [],
    expected: () => goodExpected,
  });
  const result = await stage.run({ job, outputId: 'fb', cancelled: () => false });
  assert.deepEqual(result?.warnings, []);
  const checks = (result?.outputs as { checks: Array<{ name: string; status: string }> }).checks;
  assert.ok(checks.every((c) => c.status === 'pass'));
  assert.deepEqual(
    checks.map((c) => c.name),
    ['duration', 'resolution', 'fps', 'integratedLufs', 'truePeak', 'blackFrames'],
  );
});

test('qa stage: fails on duration drift beyond tolerance', async () => {
  const stage = createQaStage({
    measure: async () => ({ ...goodMeasurement, durationSec: 20 }),
    detectBlackFrames: async () => [],
    expected: () => goodExpected,
  });
  await assert.rejects(
    () => stage.run({ job, outputId: 'fb', cancelled: () => false }),
    (err: unknown) => {
      assert.ok(err instanceof QaFailedError);
      assert.match((err as Error).message, /duration.*measured 20\.00s vs expected 25\.60s/);
      return true;
    },
  );
});

test('qa stage: fails on wrong resolution', async () => {
  const stage = createQaStage({
    measure: async () => ({ ...goodMeasurement, width: 1920, height: 1080 }),
    detectBlackFrames: async () => [],
    expected: () => goodExpected,
  });
  await assert.rejects(
    () => stage.run({ job, outputId: 'fb', cancelled: () => false }),
    /resolution.*1920x1080.*1080x1920/,
  );
});

test('qa stage: fails on true peak exceeding the ceiling (real clipping risk)', async () => {
  const stage = createQaStage({
    measure: async () => ({ ...goodMeasurement, truePeakDb: 0.5 }),
    detectBlackFrames: async () => [],
    expected: () => goodExpected,
  });
  await assert.rejects(
    () => stage.run({ job, outputId: 'fb', cancelled: () => false }),
    /truePeak.*exceeds ceiling/,
  );
});

test('qa stage: integrated LUFS drift is a warning, not a failure (pacing varies legitimately)', async () => {
  const stage = createQaStage({
    measure: async () => ({ ...goodMeasurement, integratedLufs: -27 }),
    detectBlackFrames: async () => [],
    expected: () => goodExpected,
  });
  const result = await stage.run({ job, outputId: 'fb', cancelled: () => false });
  assert.deepEqual(result?.warnings, [
    "integratedLufs: measured -27.00 LUFS vs target -14 (off by 13.00 LU) — verify this isn't a silent/broken audio track, not necessarily a defect on its own",
  ]);
});

test('qa stage: a black segment inside ignoreBlackAfterSec is excluded entirely (e.g. a deliberately dark end card)', async () => {
  const stage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [{ startSec: 24.07, endSec: 25.53 }],
    expected: () => ({ ...goodExpected, ignoreBlackAfterSec: 24.0 }),
  });
  const result = await stage.run({ job, outputId: 'fb', cancelled: () => false });
  assert.deepEqual(result?.warnings, []);
  const checks = (result?.outputs as { checks: Array<{ name: string; status: string }> }).checks;
  assert.ok(checks.some((c) => c.name === 'blackFrames' && c.status === 'pass'));
});

test('qa stage: a black segment before ignoreBlackAfterSec still fails', async () => {
  const stage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [{ startSec: 5, endSec: 6 }],
    expected: () => ({ ...goodExpected, ignoreBlackAfterSec: 24.0 }),
  });
  await assert.rejects(
    () => stage.run({ job, outputId: 'fb', cancelled: () => false }),
    /blackFrames.*1 black segment/,
  );
});

test('qa stage: a long black segment fails; a brief one only warns', async () => {
  const longBlackStage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [{ startSec: 5, endSec: 6 }],
    expected: () => goodExpected,
  });
  await assert.rejects(
    () => longBlackStage.run({ job, outputId: 'fb', cancelled: () => false }),
    /blackFrames.*1 black segment/,
  );

  const briefBlackStage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [{ startSec: 5, endSec: 5.1 }],
    expected: () => goodExpected,
  });
  const result = await briefBlackStage.run({ job, outputId: 'fb', cancelled: () => false });
  assert.equal(result?.warnings?.length, 1);
  assert.match(result!.warnings![0], /blackFrames: 1 brief black frame/);
});

test('qa stage: highlight boxes near an edge warn on the safe-zone check', async () => {
  const stage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [],
    expected: () => ({
      ...goodExpected,
      highlights: [{ x: 0.01, y: 0.5, width: 0.1, height: 0.1 }],
    }),
  });
  const result = await stage.run({ job, outputId: 'fb', cancelled: () => false });
  assert.equal(result?.warnings?.length, 1);
  assert.match(result!.warnings![0], /overlaySafeZone: 1 highlight box/);
});

test('qa stage: a highlight box safely inside the margin passes', async () => {
  const stage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [],
    expected: () => ({
      ...goodExpected,
      highlights: [{ x: 0.3, y: 0.3, width: 0.2, height: 0.2 }],
    }),
  });
  const result = await stage.run({ job, outputId: 'fb', cancelled: () => false });
  assert.deepEqual(result?.warnings, []);
  const checks = (result?.outputs as { checks: Array<{ name: string; status: string }> }).checks;
  assert.ok(checks.some((c) => c.name === 'overlaySafeZone' && c.status === 'pass'));
});

test('qa stage: visionCheck is skipped entirely when not supplied, and warns (not fails) when it flags an issue', async () => {
  const noVisionStage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [],
    expected: () => goodExpected,
  });
  const noVisionResult = await noVisionStage.run({ job, outputId: 'fb', cancelled: () => false });
  const noVisionChecks = (noVisionResult?.outputs as { checks: Array<{ name: string }> }).checks;
  assert.ok(!noVisionChecks.some((c) => c.name === 'visionCheck'));

  let visionCalledWith: string | undefined;
  const visionStage = createQaStage({
    measure: async () => goodMeasurement,
    detectBlackFrames: async () => [],
    expected: () => goodExpected,
    visionCheck: async (outputId) => {
      visionCalledWith = outputId;
      return { ok: false, notes: 'frame 3 looks corrupted' };
    },
  });
  const visionResult = await visionStage.run({ job, outputId: 'fb', cancelled: () => false });
  assert.equal(visionCalledWith, 'fb');
  assert.deepEqual(visionResult?.warnings, ['visionCheck: frame 3 looks corrupted']);
});
