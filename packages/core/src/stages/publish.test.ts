import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPublishStage, type PublishFn } from './publish.ts';
import type { Job } from '../runner/index.ts';

function job(manifestOverrides: Record<string, unknown> = {}): Job {
  return {
    id: 'job-1',
    workDir: '/tmp/job-1',
    manifest: {
      outputs: ['fb'],
      publish: ['facebook'],
      disclosure: true,
      end_card: { disclosure: 'AI-narrated.' },
      captions: {
        facebook: 'Real caption body.',
        facebook_question: 'What do you think?',
        hashtags_facebook: ['wildlife', 'ocean'],
      },
      ...manifestOverrides,
    },
  };
}

test('publish stage: builds a real Facebook caption (body + question + hashtags + disclosure) and calls publish()', async () => {
  const calls: Parameters<PublishFn>[0][] = [];
  const publish: PublishFn = async (args) => {
    calls.push(args);
    return { postId: 'p1', url: 'https://facebook.com/p1' };
  };

  const stage = createPublishStage({
    publish,
    publishTargets: { facebook: 'EN' },
    renderedVideoUrls: { facebook: 'https://cdn/fb.mp4' },
  });

  const result = await stage.run({ job: job(), cancelled: () => false });
  assert.deepEqual(result?.outputs, {
    posts: { facebook: { postId: 'p1', url: 'https://facebook.com/p1' } },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].pageRef, 'EN');
  assert.equal(calls[0].video, 'https://cdn/fb.mp4');
  assert.equal(
    calls[0].caption,
    'Real caption body.\n\nWhat do you think?\n\n#wildlife #ocean\n\nAI-narrated.',
  );
});

test('publish stage: youtube caption uses youtube_description + title from youtube_shorts_title', async () => {
  const calls: Parameters<PublishFn>[0][] = [];
  const publish: PublishFn = async (args) => {
    calls.push(args);
    return { postId: 'yt1' };
  };

  const stage = createPublishStage({
    publish,
    publishTargets: { youtube: 'EN' },
    renderedVideoUrls: { youtube: 'https://cdn/yt.mp4' },
  });

  await stage.run({
    job: job({
      publish: ['youtube'],
      captions: {
        youtube_shorts_title: 'A real Short title',
        youtube_description: 'A real Short description.',
      },
    }),
    cancelled: () => false,
  });

  assert.equal(calls[0].title, 'A real Short title');
  assert.equal(calls[0].caption, 'A real Short description.\n\nAI-narrated.');
});

test('publish stage: throws a clear error when no publishTarget is configured for a platform', async () => {
  const stage = createPublishStage({
    publish: async () => ({ postId: 'x' }),
    publishTargets: {},
    renderedVideoUrls: { facebook: 'https://cdn/fb.mp4' },
  });
  await assert.rejects(
    () => stage.run({ job: job(), cancelled: () => false }),
    /no publishTarget configured for platform "facebook"/,
  );
});

test('publish stage: throws a clear error when no rendered video URL was supplied', async () => {
  const stage = createPublishStage({
    publish: async () => ({ postId: 'x' }),
    publishTargets: { facebook: 'EN' },
    renderedVideoUrls: {},
  });
  await assert.rejects(
    () => stage.run({ job: job(), cancelled: () => false }),
    /no rendered video URL supplied for platform "facebook"/,
  );
});

test('publish stage: throws rather than publish an empty caption', async () => {
  const stage = createPublishStage({
    publish: async () => ({ postId: 'x' }),
    publishTargets: { facebook: 'EN' },
    renderedVideoUrls: { facebook: 'https://cdn/fb.mp4' },
  });
  await assert.rejects(
    () =>
      stage.run({
        job: job({ disclosure: false, end_card: {}, captions: {} }),
        cancelled: () => false,
      }),
    /empty caption for platform "facebook"/,
  );
});

test('publish stage: publishes to multiple platforms in one run, each with its own caption', async () => {
  const calls: Parameters<PublishFn>[0][] = [];
  const publish: PublishFn = async (args) => {
    calls.push(args);
    return { postId: args.platform };
  };

  const stage = createPublishStage({
    publish,
    publishTargets: { facebook: 'EN', instagram: 'EN' },
    renderedVideoUrls: { facebook: 'https://cdn/fb.mp4', instagram: 'https://cdn/ig.mp4' },
  });

  const result = await stage.run({
    job: job({
      publish: ['facebook', 'instagram'],
      captions: { facebook: 'FB body', instagram: 'IG body' },
    }),
    cancelled: () => false,
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(Object.keys((result?.outputs as { posts: Record<string, unknown> }).posts), [
    'facebook',
    'instagram',
  ]);
});

test('publish stage: cancellation stops before publishing the next platform', async () => {
  let calls = 0;
  const publish: PublishFn = async () => {
    calls++;
    return { postId: 'x' };
  };
  const stage = createPublishStage({
    publish,
    publishTargets: { facebook: 'EN', instagram: 'EN' },
    renderedVideoUrls: { facebook: 'https://cdn/fb.mp4', instagram: 'https://cdn/ig.mp4' },
  });

  await stage.run({
    job: job({ publish: ['facebook', 'instagram'], captions: { facebook: 'x', instagram: 'x' } }),
    cancelled: () => true,
  });
  assert.equal(calls, 0);
});
