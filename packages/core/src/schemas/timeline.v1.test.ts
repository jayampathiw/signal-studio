import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Timeline } from './timeline.v1.ts';

function validTimeline(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    contentId: 'content-1',
    aspectRatio: '9:16',
    scenes: [{ id: 's1', durationSecs: 8 }],
    ...overrides,
  };
}

test('valid timeline passes', () => {
  assert.equal(Timeline.safeParse(validTimeline()).success, true);
});

test('scene defaults: playbackRate 1, template news-card', () => {
  const result = Timeline.parse(validTimeline());
  assert.equal(result.scenes[0].playbackRate, 1);
  assert.equal(result.template, 'news-card');
});

test('bad aspectRatio fails', () => {
  assert.equal(Timeline.safeParse(validTimeline({ aspectRatio: '4:3' })).success, false);
});

test('overlay/voStartSec/music.duckUnderVoice/watermark.text round-trip', () => {
  const result = Timeline.parse(
    validTimeline({
      scenes: [
        {
          id: 's1',
          durationSecs: 8,
          overlay: { text: 'A fact', inSec: 0.4, outSec: 4.5 },
          voStartSec: 0.4,
        },
      ],
      music: { path: 'bed.mp3', fadeOutSecs: 1, duckUnderVoice: false },
      watermark: { text: 'AI visualisation', position: 'bottom-right', opacity: 0.6 },
      outputId: 'ig',
    }),
  );
  assert.equal(result.scenes[0].overlay?.text, 'A fact');
  assert.equal(result.scenes[0].voStartSec, 0.4);
  assert.equal(result.music?.duckUnderVoice, false);
  assert.equal(result.watermark?.text, 'AI visualisation');
  assert.equal(result.outputId, 'ig');
});

test('P2.1 additions: trimInSec/sourceMuted default, music.gainDb default, watermark top-left', () => {
  const result = Timeline.parse(
    validTimeline({
      scenes: [{ id: 's1', durationSecs: 8 }],
      music: { path: 'bed.mp3', fadeOutSecs: 1 },
      watermark: { text: 'AI visualisation', position: 'top-left', opacity: 0.85 },
    }),
  );
  assert.equal(result.scenes[0].trimInSec, 0);
  assert.equal(result.scenes[0].sourceMuted, false);
  assert.equal(result.music?.gainDb, -18);
  assert.equal(result.watermark?.position, 'top-left');
});

test('negative durationSecs fails', () => {
  assert.equal(
    Timeline.safeParse(validTimeline({ scenes: [{ id: 's1', durationSecs: -1 }] })).success,
    false,
  );
});
