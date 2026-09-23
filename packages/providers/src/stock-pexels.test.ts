import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPexelsStockProvider } from './stock-pexels.ts';

function fakeResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), { status: init?.status ?? 200 });
}

test('stock-pexels: filters short clips, prefers portrait 1080p, carries attribution', async (t) => {
  let capturedUrl: string | undefined;
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    capturedUrl = url.toString();
    return fakeResponse({
      videos: [
        {
          id: 1,
          duration: 2,
          tags: ['octopus'],
          user: { name: 'Someone' },
          video_files: [
            { file_type: 'video/mp4', link: 'https://x/short.mp4', width: 1080, height: 1920 },
          ],
        },
        {
          id: 2,
          duration: 10,
          tags: ['reef'],
          user: { name: 'Another' },
          video_files: [
            { file_type: 'video/mp4', link: 'https://x/landscape.mp4', width: 1920, height: 1080 },
            {
              file_type: 'video/mp4',
              link: 'https://x/portrait-720.mp4',
              width: 720,
              height: 1280,
            },
            {
              file_type: 'video/mp4',
              link: 'https://x/portrait-1080.mp4',
              width: 1080,
              height: 1920,
            },
          ],
        },
      ],
    });
  });

  const provider = createPexelsStockProvider({ apiKey: 'test-key' });
  const results = await provider.search({
    query: 'octopus',
    orientation: 'portrait',
    minDuration: 5,
  });

  // video 1 filtered out (duration 2 < minDuration 5)
  assert.equal(results.length, 1);
  assert.equal(results[0].url, 'https://x/portrait-1080.mp4');
  assert.equal(results[0].meta.attribution, 'Another');
  assert.equal(results[0].meta.license, 'Pexels License');
  assert.ok(capturedUrl?.includes('api.pexels.com/videos/search'));
});

test('stock-pexels: throws with a clear message when the API rejects the request', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('bad key', { status: 401 }));
  const provider = createPexelsStockProvider({ apiKey: 'bad-key' });
  await assert.rejects(
    () => provider.search({ query: 'octopus', orientation: 'portrait' }),
    /Pexels search failed \(401\)/,
  );
});

test('createPexelsStockProvider: throws immediately with no API key available', () => {
  const prev = process.env.PEXELS_API_KEY;
  delete process.env.PEXELS_API_KEY;
  try {
    assert.throws(() => createPexelsStockProvider(), /missing PEXELS_API_KEY/);
  } finally {
    if (prev !== undefined) process.env.PEXELS_API_KEY = prev;
  }
});
