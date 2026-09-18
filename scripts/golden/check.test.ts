import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { compare } from './check.mjs';
import { measure } from './measure.mjs';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '__fixtures__');
const BASE_MP4 = path.join(FIXTURES_DIR, 'base.mp4');
const MUTATED_MP4 = path.join(FIXTURES_DIR, 'mutated.mp4');

test('a file passes its own freshly-measured golden.json', async () => {
  const golden = await measure(BASE_MP4);
  const actual = await measure(BASE_MP4);
  const { pass } = compare(actual, golden);
  assert.equal(pass, true);
});

test('a materially different file fails against the base golden.json', async () => {
  const golden = await measure(BASE_MP4);
  const actual = await measure(MUTATED_MP4);
  const { pass, rows } = compare(actual, golden);
  assert.equal(pass, false);
  // mutated.mp4 has no scene cut (solid color, base.mp4 hard-cuts red->blue)
  // and a much quieter tone — both should show up as failures. (Frame pHash
  // is deliberately NOT asserted here: dHash measures local gradient, and a
  // solid color has none, so a solid-green frame can hash close to a
  // solid-red/blue one — that's a property of a flat-color fixture, not a
  // bug in the hash; scene cuts + LUFS already prove the fail-path works.)
  const failedMetrics = rows.filter((r) => !r.pass).map((r) => r.metric);
  assert.ok(
    failedMetrics.includes('integrated LUFS'),
    `expected LUFS to fail, got: ${failedMetrics}`,
  );
  assert.ok(
    failedMetrics.includes('scene cuts'),
    `expected scene cuts to fail, got: ${failedMetrics}`,
  );
});
