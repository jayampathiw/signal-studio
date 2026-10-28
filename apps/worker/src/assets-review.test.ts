import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { Manifest } from '@signal-studio/core/schemas';

import { assetsReviewApproved, drawProofWithFfmpeg, recordAssetProofs } from './assets-review.ts';
import { createLogger } from './logger.ts';

const execFileAsync = promisify(execFile);
const logger = createLogger({ level: 'error' });

async function pngSize(file: string) {
  const header = (await readFile(file)).subarray(16, 24);
  return [header.readUInt32BE(0), header.readUInt32BE(4)];
}

test('drawProofWithFfmpeg draws the boxes and scales a large page down to 1280 px wide', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'assets-review-test-'));
  try {
    const input = path.join(dir, 'page.png');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=white:s=1870x2420',
      '-frames:v',
      '1',
      input,
    ]);
    const output = path.join(dir, 'proof.png');
    await drawProofWithFfmpeg({
      input,
      output,
      boxes: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.05 }],
    });
    const [w, h] = await pngSize(output);
    assert.equal(w, 1280);
    assert.ok(Math.abs(h! - Math.round((2420 * 1280) / 1870)) <= 2);

    // The box's middle is tinted (no longer white); outside it stays white.
    const pixel = async (x: number, y: number) => {
      const { stdout } = await execFileAsync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          output,
          '-vf',
          `crop=1:1:${x}:${y}`,
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          '-',
        ],
        { encoding: 'buffer' },
      );
      return [...stdout];
    };
    assert.notDeepEqual(
      await pixel(Math.round(1280 * 0.25), Math.round(h! * 0.125)),
      [255, 255, 255],
    );
    assert.deepEqual(await pixel(Math.round(1280 * 0.8), Math.round(h! * 0.8)), [255, 255, 255]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recordAssetProofs records one proof per shot with a visual, boxes included', async () => {
  const manifest = Manifest.parse({
    version: '1',
    projectRef: 'p',
    template: 'case-file',
    visual: { mode: 'case-file' },
    shots: [
      { id: 's1', image: 'page.png', highlights: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }] },
      { id: 's2', durationSecs: 3 },
      { id: 's3', image: 'photo.jpg' },
    ],
    case_file: { caseId: 'c' },
    outputs: ['fb'],
    captions: {},
  });
  const puts: string[] = [];
  const recorded: Array<{
    stage: string;
    kind: string;
    url: string;
    meta: Record<string, unknown>;
  }> = [];
  const drawn: Array<{ input: string; boxes: number }> = [];
  const count = await recordAssetProofs({
    jobId: 'j1',
    shots: manifest.shots,
    storage: {
      async signedUrl(key: string) {
        return `https://r2.test/${key}`;
      },
      async put({ key }: { localPath: string; key: string }) {
        puts.push(key);
        return { url: `https://cdn.test/${key}` };
      },
      async presignUpload(key: string) {
        return key;
      },
    },
    fetchFn: (async () => new Response('img')) as unknown as typeof fetch,
    tmpDir: os.tmpdir(),
    artifactsRepo: {
      async record(_job: string, stage: string, kind: string, url: string, meta = {}) {
        recorded.push({ stage, kind, url, meta });
        return {} as never;
      },
    },
    logger,
    drawProof: async ({ input, boxes }) => void drawn.push({ input, boxes: boxes.length }),
  });

  assert.equal(count, 2);
  assert.deepEqual(puts, [
    'jobs/j1/review/assets_review/s1.png',
    'jobs/j1/review/assets_review/s3.png',
  ]);
  assert.deepEqual(
    drawn.map((d) => d.boxes),
    [1, 0],
  );
  assert.equal(recorded[0]!.kind, 'assets-proof');
  assert.equal(recorded[0]!.stage, 'assets_review');
  assert.equal(recorded[0]!.url, 'https://cdn.test/jobs/j1/review/assets_review/s1.png');
  assert.equal(recorded[0]!.meta.shotId, 's1');
});

test('assetsReviewApproved looks for the gate-approval artifact', async () => {
  const repo = (rows: Array<{ kind: string; stage_name: string }>) => ({
    async listForJob() {
      return rows as never;
    },
  });
  assert.equal(await assetsReviewApproved(repo([]), 'j1'), false);
  assert.equal(
    await assetsReviewApproved(repo([{ kind: 'assets-proof', stage_name: 'assets_review' }]), 'j1'),
    false,
  );
  assert.equal(
    await assetsReviewApproved(
      repo([{ kind: 'gate-approval', stage_name: 'assets_review' }]),
      'j1',
    ),
    true,
  );
});
