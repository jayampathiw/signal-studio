import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertEachMatchesContract, assertMatchesContract } from './contract-test-harness.ts';

test('assertMatchesContract passes a value that satisfies its role schema', () => {
  assert.doesNotThrow(() =>
    assertMatchesContract('tts', { wavPath: '/tmp/x.wav', durationSec: 1.2 }),
  );
});

test('assertMatchesContract throws for a value that violates its role schema', () => {
  assert.throws(() => assertMatchesContract('tts', { wavPath: '/tmp/x.wav', durationSec: -1 }));
});

test('assertEachMatchesContract checks every item and returns them unchanged', () => {
  const items = [
    { text: 'hi', start: 0, end: 0.3 },
    { text: 'there', start: 0.3, end: 0.6 },
  ];
  const result = assertEachMatchesContract('captions', items);
  assert.deepEqual(result, items);
});

test('assertEachMatchesContract throws on the first invalid item', () => {
  assert.throws(() =>
    assertEachMatchesContract('captions', [{ text: 'hi', start: 0, end: 0.3 }, { bad: true }]),
  );
});
