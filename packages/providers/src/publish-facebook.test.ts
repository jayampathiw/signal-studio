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
