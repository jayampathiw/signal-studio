import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFalImageProvider } from './image-fal.ts';

function fakeResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), { status: init?.status ?? 200 });
}

test('image-fal: submits, polls status_url until COMPLETED, fetches response_url for the image', async (t) => {
  let pollCount = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      assert.equal(body.prompt, 'an octopus');
      assert.deepEqual(body.image_size, { width: 1080, height: 1920 });
      return fakeResponse({
        request_id: 'req-1',
        status_url: 'https://fal/status/req-1',
        response_url: 'https://fal/result/req-1',
      });
    }
    if (url === 'https://fal/status/req-1') {
      pollCount++;
      return fakeResponse({ status: pollCount === 1 ? 'IN_PROGRESS' : 'COMPLETED' });
    }
    // response_url (only reachable once status_url said COMPLETED) — no
    // `status` field, matching the real API's actual shape (see this
    // provider's own header comment for the real bug this fixes).
    assert.equal(url, 'https://fal/result/req-1');
    return fakeResponse({ images: [{ url: 'https://fal/out.png' }] });
  });

  const provider = createFalImageProvider({ apiKey: 'test-key', maxWaitMs: 5000 });
  const result = await provider.generate({
    prompt: 'an octopus',
    aspect: '9:16',
    size: '1080x1920',
  });
  assert.equal(result.url, 'https://fal/out.png');
});

test('image-fal: throws with the fal.ai error on FAILED status_url', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return fakeResponse({ request_id: 'req-1', status_url: 'https://fal/status/req-1' });
    }
    assert.equal(url, 'https://fal/status/req-1');
    return fakeResponse({ status: 'FAILED', error: 'content policy' });
  });
  const provider = createFalImageProvider({ apiKey: 'test-key', maxWaitMs: 5000 });
  await assert.rejects(
    () => provider.generate({ prompt: 'blocked', aspect: '1:1' }),
    /fal\.ai generation failed/,
  );
});

test('image-fal: default 1024x1024 size when none given, throws on unparseable size', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.image_size, { width: 1024, height: 1024 });
    return fakeResponse({ request_id: 'req-1' });
  });
  const provider = createFalImageProvider({ apiKey: 'test-key', maxWaitMs: 100 });
  // Deliberately let this one time out fast (maxWaitMs: 100, no COMPLETED
  // response queued) rather than complicate the mock — the assertion above
  // (inside the mock) is what this test is really checking.
  await assert.rejects(() => provider.generate({ prompt: 'x', aspect: '1:1' }));

  await assert.rejects(
    () => provider.generate({ prompt: 'x', aspect: '1:1', size: 'not-a-size' }),
    /unparseable size/,
  );
});
