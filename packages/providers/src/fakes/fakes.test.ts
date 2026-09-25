import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertImplemented, NotImplementedProviderError } from '../contracts.ts';
import { assertEachMatchesContract, assertMatchesContract } from '../contract-test-harness.ts';
import {
  fakeLlmProvider,
  fakeTtsProvider,
  fakeCaptionsProvider,
  fakeImageProvider,
  fakeStockProvider,
  fakeStorageProvider,
  fakePublishProvider,
} from './index.ts';

test('fakeLlmProvider result matches LlmResult schema', async () => {
  const result = await fakeLlmProvider.complete({
    messages: [{ role: 'user', content: 'hello world' }],
  });
  assertMatchesContract('llm', result);
});

test('fakeTtsProvider result matches TtsResult schema and scales with speed', async () => {
  const normal = await fakeTtsProvider.synthesise({
    text: 'a b c d e',
    voice: 'bm_george',
    speed: 1,
  });
  const fast = await fakeTtsProvider.synthesise({
    text: 'a b c d e',
    voice: 'bm_george',
    speed: 2,
  });
  assertMatchesContract('tts', normal);
  assert.ok(fast.durationSec < normal.durationSec);
});

test('fakeCaptionsProvider returns word timings matching WordTiming schema', async () => {
  const timings = await fakeCaptionsProvider.wordTimings({
    wavPath: '/x.wav',
    hintText: 'one two three',
  });
  assert.equal(timings.length, 3);
  assertEachMatchesContract('captions', timings);
});

test('fakeImageProvider result matches ImageResult schema', async () => {
  const result = await fakeImageProvider.generate({ prompt: 'a red fox', aspect: '9:16' });
  assertMatchesContract('image', result);
});

test('fakeStockProvider result matches StockResult schema', async () => {
  const results = await fakeStockProvider.search({ query: 'ocean', orientation: 'vertical' });
  assert.equal(results.length, 1);
  assertEachMatchesContract('stock', results);
});

test('fakeStorageProvider result matches StorageResult schema', async () => {
  const result = await fakeStorageProvider.put({ localPath: '/tmp/x.mp4', key: 'clips/x.mp4' });
  assertMatchesContract('storage', result);
  assert.match(await fakeStorageProvider.signedUrl('clips/x.mp4'), /signed=1/);
});

test('fakePublishProvider result matches PublishResult schema', async () => {
  const result = await fakePublishProvider.post({
    platform: 'facebook',
    pageRef: 'page-1',
    video: '/tmp/x.mp4',
    caption: 'hello',
  });
  assertMatchesContract('publish', result);
});

test('assertImplemented throws NotImplementedProviderError for an unimplemented id', () => {
  assert.throws(
    () => assertImplemented('publish', 'publish-instagram', new Set(['publish-facebook'])),
    NotImplementedProviderError,
  );
});

test('assertImplemented passes for an implemented id', () => {
  assert.doesNotThrow(() =>
    assertImplemented('publish', 'publish-facebook', new Set(['publish-facebook'])),
  );
});
