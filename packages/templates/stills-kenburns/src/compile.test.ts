import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compile,
  StillsKenburnsCompileError,
  type StillsKenburnsCompileParams,
} from './compile.ts';
import type { ParsedScene } from './parsers/parse-shotlist-v2.ts';

function scene(overrides: Partial<ParsedScene> = {}): ParsedScene {
  return {
    scene_n: 1,
    act: 0,
    from_tc: '0:00',
    to_tc: '0:06',
    duration_sec: 6,
    grade: null,
    vo_text: null,
    audio_cue: null,
    overlays: [],
    still_motions: [],
    stills: [],
    keep_video: false,
    kind: 'still',
    ...overrides,
  };
}

function baseParams(
  overrides: Partial<StillsKenburnsCompileParams> = {},
): StillsKenburnsCompileParams {
  return {
    contentId: 'test',
    parsed: { title: 'Test', target_duration_sec: 100, scenes: [] },
    findStillPath: () => null,
    findVoPath: () => null,
    voDurationSec: () => 0,
    ...overrides,
  };
}

test('compile: a scene with zero stills becomes a title-card scene', () => {
  const s = scene({
    scene_n: 3,
    stills: [],
    overlays: [
      { tier: 1, text: 'THE FALL', amber_word: null, zone: null, duration_sec: 4, at_sec: 21 },
    ],
  });
  const timeline = compile(
    baseParams({ parsed: { title: null, target_duration_sec: null, scenes: [s] } }),
  );
  assert.equal(timeline.scenes.length, 1);
  assert.equal(timeline.scenes[0].sceneType, 'title');
  assert.equal(timeline.scenes[0].captionText, 'THE FALL');
  assert.equal(timeline.scenes[0].cuts, undefined);
});

test('compile: title-card scene picks up a background still if S{n}-A exists', () => {
  const s = scene({ scene_n: 3, stills: [] });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: (n, cut) => (n === 3 && cut === 'A' ? '/stills/S03-A.jpg' : null),
    }),
  );
  assert.equal(timeline.scenes[0].bgImagePath, '/stills/S03-A.jpg');
});

test('compile: a single-cut scene with no VO uses the planned duration exactly', () => {
  const s = scene({
    scene_n: 1,
    duration_sec: 6,
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: () => '/stills/S01-A.jpg',
    }),
  );
  assert.equal(timeline.scenes[0].durationSecs, 6);
  assert.equal(timeline.scenes[0].cuts?.length, 1);
  assert.equal(timeline.scenes[0].cuts?.[0].durationSecs, 6);
});

test('compile: VO longer than planned stretches the scene (F4 reconciliation)', () => {
  const s = scene({
    scene_n: 1,
    duration_sec: 6,
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: () => '/stills/S01-A.jpg',
      findVoPath: () => '/vo/S01.wav',
      voDurationSec: () => 9,
    }),
  );
  // sceneDur = max(6, 9+0.4) = 9.4
  assert.equal(timeline.scenes[0].durationSecs, 9.4);
  assert.equal(timeline.scenes[0].narrationPath, '/vo/S01.wav');
});

test('compile: maxSilentTail tightens a scene whose VO ends well before the planned duration', () => {
  const s = scene({
    scene_n: 1,
    duration_sec: 13,
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: () => '/stills/S01-A.jpg',
      findVoPath: () => '/vo/S01.wav',
      voDurationSec: () => 3,
      maxSilentTail: 1,
    }),
  );
  // Without maxSilentTail this would stay at 13 (planned); with it, capped
  // to min(13, 3+1) = 4.
  assert.equal(timeline.scenes[0].durationSecs, 4);
});

test('compile: cutSplitOverrides gives exact per-cut boundaries, scaled by VO stretch', () => {
  const s = scene({
    scene_n: 2,
    duration_sec: 15,
    stills: [
      { cut: 'A', prompt: '', reference_keys: [], negative_space: null },
      { cut: 'B', prompt: '', reference_keys: [], negative_space: null },
    ],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: (n, cut) => `/stills/S02-${cut}.jpg`,
      findVoPath: () => '/vo/S02.wav',
      voDurationSec: () => 14.75, // -> sceneDur = max(15, 15.15) = 15.15, scale = 1.01
      cutSplitOverrides: { 2: [11] },
    }),
  );
  const cuts = timeline.scenes[0].cuts!;
  assert.equal(cuts.length, 2);
  // cut A: 0->11 planned, scaled *1.01 = 11.11
  assert.ok(Math.abs(cuts[0].durationSecs - 11.11) < 0.01);
  // cut B: 11->15 planned = 4, scaled *1.01 = 4.04
  assert.ok(Math.abs(cuts[1].durationSecs - 4.04) < 0.01);
});

test('compile: with no split override and auto-split disabled, cuts split the scene equally', () => {
  const s = scene({
    scene_n: 6,
    duration_sec: 10,
    stills: [
      { cut: 'A', prompt: '', reference_keys: [], negative_space: null },
      { cut: 'B', prompt: '', reference_keys: [], negative_space: null },
    ],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: (n, cut) => `/stills/S06-${cut}.jpg`,
      enableAutoCutSplit: false,
    }),
  );
  const cuts = timeline.scenes[0].cuts!;
  assert.equal(cuts[0].durationSecs, 5);
  assert.equal(cuts[1].durationSecs, 5);
});

test('compile: grade WARM/COLD map to warm_amber/cold_blue regrades on every cut', () => {
  const warm = scene({
    scene_n: 1,
    grade: 'WARM',
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const cold = scene({
    scene_n: 2,
    grade: 'COLD',
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [warm, cold] },
      findStillPath: () => '/stills/x.jpg',
    }),
  );
  assert.equal(timeline.scenes[0].cuts?.[0].regrade, 'warm_amber');
  assert.equal(timeline.scenes[1].cuts?.[0].regrade, 'cold_blue');
});

test('compile: missing still image(s) for every cut throws a clear error', () => {
  const s = scene({
    scene_n: 4,
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  assert.throws(
    () => compile(baseParams({ parsed: { title: null, target_duration_sec: null, scenes: [s] } })),
    (err: unknown) =>
      err instanceof StillsKenburnsCompileError && /S04/.test((err as Error).message),
  );
});

test('compile: real caption chunks merge onto a scene as kenBurnsOverlays, offset by scene from_sec', () => {
  const s = scene({
    scene_n: 1,
    from_tc: '0:10',
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: () => '/stills/S01-A.jpg',
      sceneCaptions: {
        S01: [
          {
            at_sec: 0,
            duration_sec: 2.86,
            words: [{ text: 'Imagine', offset_start: 0, offset_end: 0.56 }],
          },
        ],
      },
    }),
  );
  const overlays = timeline.scenes[0].kenBurnsOverlays!;
  assert.equal(overlays.length, 1);
  // fromSec (10) + chunk.at_sec (0)
  assert.equal(overlays[0].atSec, 10);
  assert.equal(overlays[0].words?.[0].text, 'Imagine');
});

test('compile: noCaptionScenes suppresses captions even when real caption data exists', () => {
  const s = scene({
    scene_n: 51,
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: () => '/stills/S51-A.jpg',
      sceneCaptions: {
        S51: [
          { at_sec: 0, duration_sec: 1, words: [{ text: 'x', offset_start: 0, offset_end: 1 }] },
        ],
      },
      noCaptionScenes: new Set([51]),
    }),
  );
  assert.equal(timeline.scenes[0].kenBurnsOverlays, undefined);
});

test('compile: a real 🔊 audio cue maps to a real SFX key on the scene', () => {
  const s = scene({
    scene_n: 7,
    audio_cue: 'A low, heavy drum hit on the cut.',
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: () => '/stills/S07-A.jpg',
    }),
  );
  assert.deepEqual(timeline.scenes[0].sfx, [{ key: 'drum_hit', atSec: 0, holdSec: undefined }]);
});

test('compile: watermarkPath and musicPlan pass through to the Timeline', () => {
  const s = scene({
    scene_n: 1,
    stills: [{ cut: 'A', prompt: '', reference_keys: [], negative_space: null }],
  });
  const timeline = compile(
    baseParams({
      parsed: { title: null, target_duration_sec: null, scenes: [s] },
      findStillPath: () => '/stills/S01-A.jpg',
      watermarkPath: '/logo.png',
      watermarkOpacity: 0.5,
      musicPlan: [{ fromSec: 0, toSec: 10, track: 'stadium_hum' }],
    }),
  );
  assert.deepEqual(timeline.watermark, {
    path: '/logo.png',
    position: 'bottom-right',
    opacity: 0.5,
  });
  assert.deepEqual(timeline.musicPlan, [
    { fromSec: 0, toSec: 10, track: 'stadium_hum', gainDb: -23 },
  ]);
});
