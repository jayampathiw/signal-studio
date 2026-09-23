import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createYoutubePublishProvider, type YoutubeVideosInsertClient } from './publish-youtube.ts';

function fakeVideoBytes(): Response {
  return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
}

test('publish-youtube: uploads with title/description/containsSyntheticMedia, public by default', async () => {
  let captured: Parameters<YoutubeVideosInsertClient['videos']['insert']>[0] | undefined;
  const youtubeClient: YoutubeVideosInsertClient = {
    videos: {
      async insert(args) {
        captured = args;
        return { data: { id: 'yt123' } };
      },
    },
  };
  const fetchFn = (async () => fakeVideoBytes()) as typeof fetch;

  const provider = createYoutubePublishProvider({ youtubeClient, fetchFn });
  const result = await provider.post({
    platform: 'youtube',
    pageRef: 'EN',
    video: 'https://cdn/x.mp4',
    caption: 'A real description',
    title: 'A real title',
    aiDisclosure: true,
  });

  assert.equal(captured?.requestBody.snippet.title, 'A real title');
  assert.equal(captured?.requestBody.snippet.description, 'A real description');
  assert.equal(captured?.requestBody.status.containsSyntheticMedia, true);
  assert.equal(captured?.requestBody.status.privacyStatus, 'public');
  assert.equal(captured?.requestBody.status.publishAt, undefined);
  assert.deepEqual(result, { postId: 'yt123', url: 'https://www.youtube.com/shorts/yt123' });
});

test('publish-youtube: scheduleAt sets privacyStatus=private + publishAt (real YouTube scheduled-publish mechanism)', async () => {
  let captured: Parameters<YoutubeVideosInsertClient['videos']['insert']>[0] | undefined;
  const youtubeClient: YoutubeVideosInsertClient = {
    videos: {
      async insert(args) {
        captured = args;
        return { data: { id: 'yt1' } };
      },
    },
  };
  const fetchFn = (async () => fakeVideoBytes()) as typeof fetch;

  const provider = createYoutubePublishProvider({ youtubeClient, fetchFn });
  await provider.post({
    platform: 'youtube',
    pageRef: 'EN',
    video: 'https://cdn/x.mp4',
    caption: 'x',
    scheduleAt: '2026-01-01T00:00:00Z',
  });

  assert.equal(captured?.requestBody.status.privacyStatus, 'private');
  assert.equal(captured?.requestBody.status.publishAt, '2026-01-01T00:00:00Z');
});

test('publish-youtube: a failed download throws before ever calling videos.insert', async () => {
  let insertCalled = false;
  const youtubeClient: YoutubeVideosInsertClient = {
    videos: {
      async insert() {
        insertCalled = true;
        return { data: { id: 'x' } };
      },
    },
  };
  const fetchFn = (async () => new Response('not found', { status: 404 })) as typeof fetch;

  const provider = createYoutubePublishProvider({ youtubeClient, fetchFn });
  await assert.rejects(
    () =>
      provider.post({
        platform: 'youtube',
        pageRef: 'EN',
        video: 'https://cdn/missing.mp4',
        caption: 'x',
      }),
    /download failed \(404\)/,
  );
  assert.equal(insertCalled, false);
});
