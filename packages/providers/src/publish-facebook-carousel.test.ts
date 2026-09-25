import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createFacebookCarouselPublishProvider } from './publish-facebook-carousel.ts';

function fakeResponse(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), { status: init?.status ?? 200 });
}

test('publish-facebook-carousel: uploads each image unpublished, then posts one feed entry referencing all of them', async () => {
  const calls: { url: string; body: URLSearchParams }[] = [];
  let photoCount = 0;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body as URLSearchParams });
    if (url.endsWith('/photos')) {
      photoCount += 1;
      return fakeResponse({ id: `photo-${photoCount}` });
    }
    return fakeResponse({ id: 'post-1' });
  }) as typeof fetch;

  const provider = createFacebookCarouselPublishProvider({
    env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok-abc' },
    fetchFn,
  });
  const result = await provider.post({
    platform: 'facebook',
    pageRef: 'EN',
    images: ['https://cdn/1.png', 'https://cdn/2.png', 'https://cdn/3.png'],
    caption: 'A real carousel caption',
  });

  const photoCalls = calls.filter((c) => c.url.endsWith('/photos'));
  assert.equal(photoCalls.length, 3);
  assert.equal(photoCalls[0].url, 'https://graph.facebook.com/v22.0/999/photos');
  assert.equal(photoCalls[0].body.get('url'), 'https://cdn/1.png');
  assert.equal(photoCalls[0].body.get('published'), 'false');
  assert.equal(photoCalls[0].body.get('access_token'), 'tok-abc');

  const feedCall = calls.find((c) => c.url.endsWith('/feed'));
  assert.ok(feedCall);
  assert.equal(feedCall.url, 'https://graph.facebook.com/v22.0/999/feed');
  assert.equal(feedCall.body.get('message'), 'A real carousel caption');
  assert.deepEqual(JSON.parse(feedCall.body.get('attached_media[0]')!), { media_fbid: 'photo-1' });
  assert.deepEqual(JSON.parse(feedCall.body.get('attached_media[1]')!), { media_fbid: 'photo-2' });
  assert.deepEqual(JSON.parse(feedCall.body.get('attached_media[2]')!), { media_fbid: 'photo-3' });

  assert.deepEqual(result, { postId: 'post-1', url: 'https://www.facebook.com/post-1' });
});

test('publish-facebook-carousel: scheduleAt sets published=false + a unix scheduled_publish_time on the feed post', async () => {
  let feedBody: URLSearchParams | undefined;
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/photos')) return fakeResponse({ id: 'p1' });
    feedBody = init?.body as URLSearchParams;
    return fakeResponse({ id: '1' });
  }) as typeof fetch;

  const provider = createFacebookCarouselPublishProvider({
    env: { FB_PAGE_ID_EN: '999', FB_ACCESS_TOKEN_EN: 'tok' },
    fetchFn,
  });
  await provider.post({
    platform: 'facebook',
    pageRef: 'EN',
    images: ['https://cdn/1.png', 'https://cdn/2.png'],
    caption: 'x',
    scheduleAt: '2026-01-01T00:00:00Z',
  });

  assert.equal(feedBody?.get('published'), 'false');
  assert.equal(
    feedBody?.get('scheduled_publish_time'),
    String(Math.floor(Date.parse('2026-01-01T00:00:00Z') / 1000)),
  );
});

test('publish-facebook-carousel: missing page credentials throws a clear, specific error', async () => {
  const provider = createFacebookCarouselPublishProvider({ env: {} });
  await assert.rejects(
    () =>
      provider.post({
        platform: 'facebook',
        pageRef: 'FR',
        images: ['a', 'b'],
        caption: 'x',
      }),
    /FB_PAGE_ID_FR.*FB_ACCESS_TOKEN_FR/,
  );
});

test('publish-facebook-carousel: fewer than 2 images throws a clear error before any network call', async () => {
  const fetchFn = (async () => {
    throw new Error('should not be called');
  }) as typeof fetch;
  const provider = createFacebookCarouselPublishProvider({
    env: { FB_PAGE_ID_EN: '1', FB_ACCESS_TOKEN_EN: 't' },
    fetchFn,
  });
  await assert.rejects(
    () => provider.post({ platform: 'facebook', pageRef: 'EN', images: ['x'], caption: 'x' }),
    /at least 2 images, got 1/,
  );
});

test('publish-facebook-carousel: a non-OK photo upload response throws with the real status/body and stops before the feed call', async () => {
  let feedCalled = false;
  const fetchFn = (async (url: string) => {
    if (url.endsWith('/photos')) return new Response('bad photo', { status: 400 });
    feedCalled = true;
    return fakeResponse({ id: '1' });
  }) as typeof fetch;
  const provider = createFacebookCarouselPublishProvider({
    env: { FB_PAGE_ID_EN: '1', FB_ACCESS_TOKEN_EN: 't' },
    fetchFn,
  });
  await assert.rejects(
    () =>
      provider.post({
        platform: 'facebook',
        pageRef: 'EN',
        images: ['a', 'b'],
        caption: 'x',
      }),
    /Facebook carousel photo upload failed \(400\)/,
  );
  assert.equal(feedCalled, false);
});

test('publish-facebook-carousel: a non-OK feed post response throws with the real status/body', async () => {
  const fetchFn = (async (url: string) => {
    if (url.endsWith('/photos')) return fakeResponse({ id: 'p1' });
    return new Response('bad feed', { status: 400 });
  }) as typeof fetch;
  const provider = createFacebookCarouselPublishProvider({
    env: { FB_PAGE_ID_EN: '1', FB_ACCESS_TOKEN_EN: 't' },
    fetchFn,
  });
  await assert.rejects(
    () =>
      provider.post({
        platform: 'facebook',
        pageRef: 'EN',
        images: ['a', 'b'],
        caption: 'x',
      }),
    /Facebook carousel post failed \(400\)/,
  );
});
