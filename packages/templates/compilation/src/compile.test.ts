import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Timeline, type TimelineT } from '@signal-studio/core/schemas';

import { compile, CompilationCompileError } from './compile.ts';

function episodeTimeline(overrides: Partial<TimelineT> = {}): TimelineT {
  return Timeline.parse({
    contentId: 'ep-content',
    aspectRatio: '9:16',
    template: 'clips-overlay',
    scenes: [
      { id: 's1', durationSecs: 4, source: { localPath: '/clips/s1.mp4', type: 'video' } },
      { id: 's2', durationSecs: 3, source: { localPath: '/clips/s2.mp4', type: 'video' } },
    ],
    // Every real episode Timeline carries its own end card — compile() must
    // never let this leak into the compiled output.
    cta: {
      line1: 'Episode end card',
      line2: 'should be dropped',
      durationSecs: 1.5,
      position: 'end',
    },
    ...overrides,
  });
}

const sharedCta = {
  line1: 'Series',
  line2: 'AI visualisation',
  durationSecs: 1.5,
  position: 'end' as const,
};

test('compile: flattens episodes into title + shot scenes, drops each episode cta', () => {
  const result = compile(
    [
      { title: 'Episode One', timeline: episodeTimeline() },
      { title: 'Episode Two', timeline: episodeTimeline({ contentId: 'ep-2' }) },
    ],
    { contentId: 'compilation-1', cta: sharedCta },
  );

  assert.equal(result.template, 'compilation');
  assert.equal(result.scenes.length, 6); // 2 episodes x (1 title + 2 shots)

  assert.equal(result.scenes[0].sceneType, 'title');
  assert.equal(result.scenes[0].captionText, 'Episode One');
  assert.equal(result.scenes[1].sceneType, 'shot');
  assert.equal(result.scenes[1].id, 's1');
  assert.equal(result.scenes[2].sceneType, 'shot');
  assert.equal(result.scenes[2].id, 's2');
  assert.equal(result.scenes[3].sceneType, 'title');
  assert.equal(result.scenes[3].captionText, 'Episode Two');

  // The shared end card wins — neither episode's own cta appears anywhere.
  assert.deepEqual(result.cta, sharedCta);
});

test('compile: throws on zero episodes', () => {
  assert.throws(
    () => compile([], { contentId: 'compilation-1', cta: sharedCta }),
    CompilationCompileError,
  );
});

test('compile: throws on mismatched aspect ratios across episodes', () => {
  assert.throws(
    () =>
      compile(
        [
          { title: 'Episode One', timeline: episodeTimeline() },
          { title: 'Episode Two', timeline: episodeTimeline({ aspectRatio: '16:9' }) },
        ],
        { contentId: 'compilation-1', cta: sharedCta },
      ),
    CompilationCompileError,
  );
});

test('compile: warns via console.error when compiled duration exceeds targetSeconds, does not throw or trim', () => {
  const originalError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => calls.push(args);
  try {
    const result = compile([{ title: 'Episode One', timeline: episodeTimeline() }], {
      contentId: 'compilation-1',
      cta: sharedCta,
      targetSeconds: 1, // total scene time is 1.2 (title) + 4 + 3 = 8.2s, well over 1s
    });
    assert.equal(result.scenes.length, 3);
    assert.equal(calls.length, 1);
    assert.match(String(calls[0][0]), /exceeds compilationTargetS/);
  } finally {
    console.error = originalError;
  }
});

test('compile: no warning when under targetSeconds', () => {
  const originalError = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => calls.push(args);
  try {
    compile([{ title: 'Episode One', timeline: episodeTimeline() }], {
      contentId: 'compilation-1',
      cta: sharedCta,
      targetSeconds: 1000,
    });
    assert.equal(calls.length, 0);
  } finally {
    console.error = originalError;
  }
});
