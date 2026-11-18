import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFacebookPublishProvider } from './publish-facebook.ts';

function fakeResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), { status: init?.status ?? 200 });
}

test('publish-facebook: posts file_url/description/access_token from the resolved page credentials', async () => {
  let capturedUrl: string | undefined;
  let capturedBody: URLSearchParams | undefined;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedBody = init?.body as URLSearchParams;
    return fakeResponse({ id: '12345' });
  }) as typeof fetch;

  const provider = createFacebookPublishProvider({
    env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok-abc' },
    fetchFn,
  });
  const result = await provider.post({
    platform: 'facebook',
    pageRef: 'EN',
    video: 'https://cdn/x.mp4',
    caption: 'A real caption',
    title: 'A title',
  });

  assert.equal(capturedUrl, 'https://graph.facebook.com/v22.0/999/videos');
  assert.equal(capturedBody?.get('file_url'), 'https://cdn/x.mp4');
  assert.equal(capturedBody?.get('description'), 'A real caption');
  assert.equal(capturedBody?.get('title'), 'A title');
  assert.equal(capturedBody?.get('access_token'), 'tok-abc');
  assert.deepEqual(result, { postId: '12345', url: 'https://www.facebook.com/12345' });
});

test('publish-facebook: scheduleAt sets published=false + a unix scheduled_publish_time', async () => {
  let capturedBody: URLSearchParams | undefined;
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    capturedBody = init?.body as URLSearchParams;
    return fakeResponse({ id: '1' });
  }) as typeof fetch;

  const provider = createFacebookPublishProvider({
    env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok' },
    fetchFn,
  });
  await provider.post({
    platform: 'facebook',
    pageRef: 'EN',
    video: 'https://cdn/x.mp4',
    caption: 'x',
    scheduleAt: '2026-01-01T00:00:00Z',
  });

  assert.equal(capturedBody?.get('published'), 'false');
  assert.equal(
    capturedBody?.get('scheduled_publish_time'),
    String(Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000)),
  );
});

test('publish-facebook: missing page credentials throws a clear, specific error', async () => {
  const provider = createFacebookPublishProvider({ env: {} });
  await assert.rejects(
    () => provider.post({ platform: 'facebook', pageRef: 'FR', video: 'x', caption: 'x' }),
    /FB_PAGE_ID_FR.*FB_ACCESS_TOKEN_FR/,
  );
});

test('publish-facebook: a non-OK Graph API response throws with the real status/body', async () => {
  const fetchFn = (async () => new Response('bad request', { status: 400 })) as typeof fetch;
  const provider = createFacebookPublishProvider({
    env: { FB_PAGE_ID_EN: '1', FB_ACCESS_TOKEN_EN: 't' },
    fetchFn,
  });
  await assert.rejects(
    () => provider.post({ platform: 'facebook', pageRef: 'EN', video: 'x', caption: 'x' }),
    /Facebook publish failed \(400\)/,
  );
});

const PUBLISHED = {
  processing_phase: { status: 'complete' },
  publishing_phase: { status: 'complete', publish_status: 'published' },
};

// `finishes`: what each finish call returns, in order (default success).
// `statuses`: what each status read returns, a Response for an HTTP error.
function reelWorld(opts: { statuses?: unknown[]; finishes?: Response[] } = {}) {
  const statuses = opts.statuses ?? [PUBLISHED];
  const finishes = [...(opts.finishes ?? [])];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let polls = 0;
  let starts = 0;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/999/video_reels')) {
      const phase = (init?.body as URLSearchParams).get('upload_phase');
      if (phase === 'start') return fakeResponse({ video_id: `v${77 + starts++}` });
      return finishes.shift() ?? fakeResponse({ success: true });
    }
    if (url.startsWith('https://rupload.facebook.com/')) return fakeResponse({ success: true });
    if (url === 'https://r2.test/cover.jpg') return new Response(new Uint8Array([1, 2, 3]));
    if (url.endsWith('/thumbnails')) return fakeResponse({ success: true });
    if (url.includes('?fields=status,published')) {
      const s = statuses[Math.min(polls++, statuses.length - 1)];
      return s instanceof Response ? s.clone() : fakeResponse({ status: s, published: true });
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  const provider = createFacebookPublishProvider({
    env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok' },
    fetchFn,
    sleep: async () => {},
    pollAttempts: 3,
  });
  return { calls, provider };
}

const reel = {
  platform: 'facebook',
  pageRef: 'EN',
  video: 'https://r2.test/fb.mp4',
  caption: 'A caption',
  reel: true,
};

const steps = (calls: Array<{ url: string; init?: RequestInit }>) =>
  calls.map((c) => {
    const body = c.init?.body;
    if (body instanceof URLSearchParams && body.has('upload_phase')) {
      return `${body.get('upload_phase')}${body.get('video_id') ? `:${body.get('video_id')}` : ''}`;
    }
    if (c.url.startsWith('https://rupload')) return `upload:${c.url.split('/').at(-1)}`;
    if (c.url.includes('fields=status')) return 'status';
    return c.url;
  });

test('publish-facebook: a reel goes start → upload by URL → finish(PUBLISHED) → status', async () => {
  const { calls, provider } = reelWorld({
    statuses: [{ processing_phase: { status: 'in_progress' } }, PUBLISHED],
  });
  const result = await provider.post({ ...reel, aiDisclosure: true });

  assert.deepEqual(steps(calls), ['start', 'upload:v77', 'finish:v77', 'status', 'status']);
  const headers = calls[1]!.init!.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'OAuth tok');
  assert.equal(headers.file_url, 'https://r2.test/fb.mp4');
  const finish = calls[2]!.init!.body as URLSearchParams;
  assert.equal(finish.get('video_state'), 'PUBLISHED');
  assert.equal(finish.get('scheduled_publish_time'), null);
  assert.equal(finish.get('description'), 'A caption');
  assert.equal(finish.get('is_ai_generated'), 'true');
  assert.ok(!calls.some((c) => c.url.endsWith('/videos')));
  assert.equal(result.postId, 'v77');
  assert.equal(result.url, 'https://www.facebook.com/reel/v77');
  assert.equal(result.status?.published, true);
});

test('publish-facebook: a reel is never scheduled on Facebook', async () => {
  const { calls, provider } = reelWorld();
  await assert.rejects(
    () => provider.post({ ...reel, scheduleAt: '2026-11-06T00:00:00Z' }),
    /not scheduled on Facebook/,
  );
  assert.equal(calls.length, 0);
});

const uploadMissing = () =>
  new Response(
    '{"error":{"message":"There was a problem uploading your video file.","code":6000,"error_subcode":1363130}}',
    { status: 400 },
  );

test('publish-facebook: "Video Upload Is Missing" at finish re-runs start + upload once', async () => {
  const { calls, provider } = reelWorld({ finishes: [uploadMissing()] });
  const result = await provider.post(reel);
  assert.deepEqual(steps(calls), [
    'start',
    'upload:v77',
    'finish:v77',
    'start',
    'upload:v78',
    'finish:v78',
    'status',
  ]);
  assert.equal(result.postId, 'v78');
});

test('publish-facebook: a second "Video Upload Is Missing" fails the post', async () => {
  const { calls, provider } = reelWorld({ finishes: [uploadMissing(), uploadMissing()] });
  await assert.rejects(() => provider.post(reel), /reel finish failed \(400\).*1363130/);
  assert.equal(steps(calls).filter((s) => s === 'start').length, 2);
});

test('publish-facebook: other finish errors are not retried', async () => {
  const { calls, provider } = reelWorld({
    finishes: [new Response('{"error":{"code":100}}', { status: 400 })],
  });
  await assert.rejects(() => provider.post(reel), /reel finish failed/);
  assert.equal(steps(calls).filter((s) => s === 'start').length, 1);
});

test('publish-facebook: onFinished runs after finish, and finishedVideoId only confirms', async () => {
  const { calls, provider } = reelWorld();
  const finished: string[] = [];
  await provider.post({ ...reel, onFinished: async (id) => void finished.push(id) });
  assert.deepEqual(finished, ['v77']);

  calls.length = 0;
  const result = await provider.post({ ...reel, finishedVideoId: 'v77' });
  assert.deepEqual(steps(calls), ['status']);
  assert.equal(result.postId, 'v77');
});

test('publish-facebook: a 429 on the status read is waited out', async () => {
  const { calls, provider } = reelWorld({
    statuses: [
      new Response('{"error":{"type":"TooManyRequestsException"}}', { status: 429 }),
      PUBLISHED,
    ],
  });
  const result = await provider.post(reel);
  assert.equal(steps(calls).filter((s) => s === 'status').length, 2);
  assert.equal(result.postId, 'v77');
});

test('publish-facebook: a reel not published when the wait ends fails', async () => {
  const { provider } = reelWorld({
    statuses: [
      { processing_phase: { status: 'complete' }, publishing_phase: { status: 'not_started' } },
    ],
  });
  await assert.rejects(() => provider.post(reel), /reel v77 was finished but isn't published yet/);
});

test('publish-facebook: a reel Facebook rejects in processing fails with its message', async () => {
  const { provider } = reelWorld({
    statuses: [
      { processing_phase: { status: 'error', error: { message: 'Resolution too low.' } } },
    ],
  });
  await assert.rejects(() => provider.post(reel), /reel v77 failed: Resolution too low/);
});

test('publish-facebook: a cover is uploaded to /thumbnails before finish', async () => {
  const { calls, provider } = reelWorld();
  await provider.post({ ...reel, cover: 'https://r2.test/cover.jpg' });
  const thumbIdx = calls.findIndex(
    (c) => c.url === 'https://graph.facebook.com/v22.0/v77/thumbnails',
  );
  assert.ok(thumbIdx > 0 && thumbIdx < steps(calls).indexOf('finish:v77'));
  const form = calls[thumbIdx]!.init!.body as FormData;
  assert.equal(form.get('is_preferred'), 'true');
  assert.ok(form.get('source') instanceof Blob);
});

test('publish-facebook: a refused cover still posts the reel', async () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void errors.push(a);
  try {
    const calls: string[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith('/thumbnails'))
        return new Response('{"error":{"code":100}}', { status: 400 });
      if (url === 'https://r2.test/cover.jpg') return new Response(new Uint8Array([1]));
      if (url.endsWith('/999/video_reels')) {
        const start = (init?.body as URLSearchParams).get('upload_phase') === 'start';
        return fakeResponse(start ? { video_id: 'v77' } : { success: true });
      }
      if (url.startsWith('https://rupload')) return fakeResponse({ success: true });
      return fakeResponse({ status: PUBLISHED });
    }) as typeof fetch;
    const p = createFacebookPublishProvider({
      env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok' },
      fetchFn,
      sleep: async () => {},
    });
    const result = await p.post({ ...reel, cover: 'https://r2.test/cover.jpg' });
    assert.equal(result.postId, 'v77');
    assert.equal(errors.length, 1);
  } finally {
    console.error = original;
  }
});

test('publish-facebook: if Facebook refuses is_ai_generated, the reel still posts without it', async () => {
  const finishes: URLSearchParams[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/999/video_reels')) {
      const body = init?.body as URLSearchParams;
      if (body.get('upload_phase') === 'start') return fakeResponse({ video_id: 'v77' });
      finishes.push(new URLSearchParams(body));
      return body.has('is_ai_generated')
        ? new Response('{"error":{"message":"(#100) Param is_ai_generated is not valid"}}', {
            status: 400,
          })
        : fakeResponse({ success: true });
    }
    if (url.startsWith('https://rupload.facebook.com/')) return fakeResponse({ success: true });
    return fakeResponse({ status: PUBLISHED });
  }) as typeof fetch;
  const p = createFacebookPublishProvider({
    env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok' },
    fetchFn,
    sleep: async () => {},
  });
  const result = await p.post({ ...reel, aiDisclosure: true });
  assert.equal(finishes.length, 2);
  assert.equal(finishes[0]!.get('is_ai_generated'), 'true');
  assert.equal(finishes[1]!.get('is_ai_generated'), null);
  assert.equal(result.postId, 'v77');
});
