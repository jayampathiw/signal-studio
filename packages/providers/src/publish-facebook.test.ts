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

function reelWorld(statuses: unknown[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let polls = 0;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/999/video_reels')) {
      const phase = (init?.body as URLSearchParams).get('upload_phase');
      return fakeResponse(phase === 'start' ? { video_id: 'v77' } : { success: true });
    }
    if (url.startsWith('https://rupload.facebook.com/')) return fakeResponse({ success: true });
    if (url.startsWith('https://graph.facebook.com/v22.0/v77?fields=status')) {
      return fakeResponse({ status: statuses[Math.min(polls++, statuses.length - 1)] });
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

test('publish-facebook: a reel goes start → upload by URL → finish with is_ai_generated', async () => {
  const { calls, provider } = reelWorld([
    { processing_phase: { status: 'in_progress' } },
    { processing_phase: { status: 'complete' }, publishing_phase: { publish_status: 'published' } },
  ]);
  const result = await provider.post({
    platform: 'facebook',
    pageRef: 'EN',
    video: 'https://r2.test/fb.mp4',
    caption: 'A caption',
    reel: true,
    aiDisclosure: true,
  });

  assert.equal(calls[0]!.url, 'https://graph.facebook.com/v22.0/999/video_reels');
  assert.equal((calls[0]!.init!.body as URLSearchParams).get('upload_phase'), 'start');
  assert.equal(calls[1]!.url, 'https://rupload.facebook.com/video-upload/v22.0/v77');
  const headers = calls[1]!.init!.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'OAuth tok');
  assert.equal(headers.file_url, 'https://r2.test/fb.mp4');
  const finish = calls[2]!.init!.body as URLSearchParams;
  assert.equal(finish.get('upload_phase'), 'finish');
  assert.equal(finish.get('video_id'), 'v77');
  assert.equal(finish.get('video_state'), 'PUBLISHED');
  assert.equal(finish.get('description'), 'A caption');
  assert.equal(finish.get('is_ai_generated'), 'true');
  assert.equal(calls.filter((c) => c.url.includes('fields=status')).length, 2);
  assert.ok(!calls.some((c) => c.url.endsWith('/videos')));
  assert.deepEqual(result, { postId: 'v77', url: 'https://www.facebook.com/reel/v77' });
});

test('publish-facebook: a scheduled reel uses SCHEDULED + scheduled_publish_time; no label when not disclosed', async () => {
  const { calls, provider } = reelWorld([{ publishing_phase: { publish_status: 'scheduled' } }]);
  await provider.post({
    platform: 'facebook',
    pageRef: 'EN',
    video: 'https://r2.test/fb.mp4',
    caption: 'x',
    reel: true,
    scheduleAt: '2026-11-06T00:00:00Z',
  });
  const finish = calls[2]!.init!.body as URLSearchParams;
  assert.equal(finish.get('video_state'), 'SCHEDULED');
  assert.equal(
    finish.get('scheduled_publish_time'),
    String(Math.floor(Date.parse('2026-11-06T00:00:00Z') / 1000)),
  );
  assert.equal(finish.get('is_ai_generated'), null);
});

test('publish-facebook: a reel Facebook rejects in processing fails with its message', async () => {
  const { provider } = reelWorld([
    { processing_phase: { status: 'error', error: { message: 'Resolution too low.' } } },
  ]);
  await assert.rejects(
    () =>
      provider.post({ platform: 'facebook', pageRef: 'EN', video: 'x', caption: 'x', reel: true }),
    /reel v77 failed: Resolution too low/,
  );
});

test('publish-facebook: still processing when the wait ends still returns the reel', async () => {
  const { calls, provider } = reelWorld([{ processing_phase: { status: 'in_progress' } }]);
  const result = await provider.post({
    platform: 'facebook',
    pageRef: 'EN',
    video: 'x',
    caption: 'x',
    reel: true,
  });
  assert.equal(calls.filter((c) => c.url.includes('fields=status')).length, 3);
  assert.equal(result.postId, 'v77');
});

test('publish-facebook: if Facebook refuses is_ai_generated, the reel still posts without it', async () => {
  const finishes: URLSearchParams[] = [];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
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
    return fakeResponse({ status: { processing_phase: { status: 'complete' } } });
  }) as typeof fetch;
  const p = createFacebookPublishProvider({
    env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok' },
    fetchFn,
    sleep: async () => {},
  });
  const result = await p.post({
    platform: 'facebook',
    pageRef: 'EN',
    video: 'x',
    caption: 'x',
    reel: true,
    aiDisclosure: true,
  });
  assert.equal(finishes.length, 2);
  assert.equal(finishes[0]!.get('is_ai_generated'), 'true');
  assert.equal(finishes[1]!.get('is_ai_generated'), null);
  assert.equal(result.postId, 'v77');
});
