import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compile, ShortsCompileError, type ShortsCompileParams } from './compile.ts';

function baseParams(overrides: Partial<ShortsCompileParams> = {}): ShortsCompileParams {
  return {
    contentId: 'test',
    config: { output: 'out.mp4', scenes: [] },
    resolveImagePath: (p) => `/resolved/${p}`,
    ...overrides,
  };
}

test('compile: silent scene (no vo/vo_parts) uses target_duration_sec as-is, one cut', () => {
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [{ image: 'a.jpg', motion: 'hold', target_duration_sec: 4 }],
      },
    }),
  );
  assert.equal(timeline.scenes.length, 1);
  assert.equal(timeline.scenes[0].durationSecs, 4);
  assert.equal(timeline.scenes[0].cuts?.length, 1);
  assert.equal(timeline.scenes[0].cuts?.[0].motion, 'hold');
  assert.equal(timeline.scenes[0].cuts?.[0].imagePath, '/resolved/a.jpg');
  assert.equal(timeline.scenes[0].narrationPath, undefined);
});

test('compile: VO-reconciliation stretches scene duration beyond target when VO is longer', () => {
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [{ image: 'a.jpg', vo: 'Hello there.', target_duration_sec: 3 }],
      },
      sceneVo: { 1: { path: '/vo/S01.wav', durationSec: 5 } },
    }),
  );
  assert.equal(timeline.scenes[0].durationSecs, 5.4);
  assert.equal(timeline.scenes[0].narrationPath, '/vo/S01.wav');
});

test('compile: missing VO for a vo scene throws ShortsCompileError', () => {
  assert.throws(
    () =>
      compile(
        baseParams({
          config: {
            output: 'x.mp4',
            scenes: [{ image: 'a.jpg', vo: 'Hi', target_duration_sec: 3 }],
          },
        }),
      ),
    ShortsCompileError,
  );
});

test('compile: image2 splits the scene into two equal-duration cuts', () => {
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [
          { image: 'a.jpg', image2: 'b.jpg', vo: 'Goal disallowed.', target_duration_sec: 4 },
        ],
      },
      sceneVo: { 1: { path: '/vo/S01.wav', durationSec: 3.6 } },
    }),
  );
  const cuts = timeline.scenes[0].cuts;
  assert.equal(cuts?.length, 2);
  assert.equal(cuts?.[0].durationSecs, 2);
  assert.equal(cuts?.[1].durationSecs, 2);
  assert.equal(cuts?.[0].imagePath, '/resolved/a.jpg');
  assert.equal(cuts?.[1].imagePath, '/resolved/b.jpg');
});

test('compile: hook scene wraps long text into multiple full-size tier-1 overlays with distinct y', () => {
  const longHook =
    'Germany hadn’t lost a World Cup penalty shootout in fifty years and everyone assumed';
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [
          {
            image: 'a.jpg',
            vo: longHook,
            target_duration_sec: 4,
            hook: { amber_word: 'fifty years' },
          },
        ],
      },
      sceneVo: { 1: { path: '/vo/S01.wav', durationSec: 3.6 } },
    }),
  );
  const overlays = timeline.scenes[0].kenBurnsOverlays;
  assert.ok(overlays && overlays.length > 1, 'expected the hook to wrap into >1 line');
  const ys = overlays!.map((o) => o.y);
  assert.equal(new Set(ys).size, ys.length, 'each wrapped line should get its own y');
  assert.ok(overlays!.some((o) => o.amberWord === 'fifty years'));
  // Hook overlay duration is capped by config target_duration_sec (min 3),
  // NOT by the final VO-stretched duration — a faithful port of the
  // original script's own (deliberate) quirk.
  assert.equal(overlays![0].durationSec, 3);
});

test('compile: non-hook vo scene builds tier-2 caption overlays from sceneCaptions', () => {
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [{ image: 'a.jpg', vo: 'Nine kicks in. Score level.', target_duration_sec: 3 }],
      },
      sceneVo: { 1: { path: '/vo/S01.wav', durationSec: 2.6 } },
      sceneCaptions: {
        1: [
          {
            start: 0,
            end: 1.2,
            words: [
              { text: 'Nine', start: 0, end: 0.4 },
              { text: 'kicks', start: 0.4, end: 0.8 },
              { text: 'in.', start: 0.8, end: 1.2 },
            ],
          },
        ],
      },
    }),
  );
  const overlays = timeline.scenes[0].kenBurnsOverlays;
  assert.equal(overlays?.length, 1);
  assert.equal(overlays?.[0].tier, 2);
  assert.equal(overlays?.[0].words?.length, 3);
  assert.equal(overlays?.[0].words?.[0].offsetStartSec, 0);
});

test('compile: end_card_v2 with vo stretches duration and carries endCard fields', () => {
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [
          {
            end_card_v2: true,
            title: 'Silenced',
            subtitle: 'Full documentary on the channel',
            vo: 'Twenty-one shots faced.',
            target_duration_sec: 5,
          },
        ],
      },
      sceneVo: { 1: { path: '/vo/card.wav', durationSec: 4.8 } },
    }),
  );
  const s = timeline.scenes[0];
  assert.deepEqual(s.endCard, { title: 'Silenced', subtitle: 'Full documentary on the channel' });
  assert.equal(s.durationSecs, 5.2);
  assert.equal(s.narrationPath, '/vo/card.wav');
  assert.equal(s.cuts, undefined);
});

test('compile: end_card_v2 hit_on_start sets hitOffsetInScene to 0 via the sound-design hit layer', () => {
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [
          {
            image: 'a.jpg',
            vo: 'setup',
            target_duration_sec: 2,
          },
          {
            end_card_v2: true,
            title: 'T',
            subtitle: 'S',
            vo: 'Penalty.',
            target_duration_sec: 2,
            hit_on_start: true,
          },
        ],
        sound_design: { hit: { key: 'musical_hit', gain_db: -6 } },
      },
      sceneVo: {
        1: { path: '/vo/S01.wav', durationSec: 1.6 },
        2: { path: '/vo/card.wav', durationSec: 1.6 },
      },
    }),
  );
  const layers = timeline.soundDesign?.layers ?? [];
  const hit = layers.find((l) => l.kind === 'oneshot');
  assert.ok(hit);
  // Scene 2 starts right after scene 1's 2.0s duration; hit_on_start means
  // the hit lands at the instant scene 2's speech starts (offset 0).
  assert.equal(hit!.startSec, 2);
  assert.equal(hit!.gainDb, -6);
});

test('compile: sound design hum/bed/heartbeat layers use real scene start times, not config targets', () => {
  const timeline = compile(
    baseParams({
      config: {
        output: 'x.mp4',
        scenes: [
          { image: 'a.jpg', vo: 'one', target_duration_sec: 3 },
          { image: 'b.jpg', vo: 'two', target_duration_sec: 3 },
          {
            image: 'c.jpg',
            vo_parts: ['He strikes it—', '—over the bar.'],
            pause_sec: 1,
            target_duration_sec: 5,
          },
        ],
        sound_design: {
          hum: { key: 'stadium_hum', gain_db: -36 },
          bed: {
            key: 'tension',
            gain_db: -20,
            start_scene: 1,
            end_scene: 3,
            fade_in_sec: 1,
            resume_gain_db: -16,
            resume_fade_in_sec: 1.5,
          },
          heartbeat: {
            key: 'heartbeat',
            gain_db: -20,
            start_scene: 2,
            start_offset_sec: 1,
            end_scene: 3,
          },
        },
      },
      // Scene 1 stretches from 3s target to 3.4s real (VO 3.0s + 0.4 pad);
      // scene 2 stays at its 3s target (VO shorter than target); scene 3's
      // pause starts at 2.0s into the scene.
      sceneVo: {
        1: { path: '/vo/S01.wav', durationSec: 3.0 },
        2: { path: '/vo/S02.wav', durationSec: 1.0 },
        3: {
          path: '/vo/S03.wav',
          durationSec: 4.6,
          pauseStartInScene: 2.0,
          hitOffsetInScene: 3.4,
        },
      },
    }),
  );

  const scene2Start = timeline.scenes[0].durationSecs; // 3.4
  const scene3Start = scene2Start + timeline.scenes[1].durationSecs; // + 3.0 = 6.4
  const layers = timeline.soundDesign?.layers ?? [];

  const hum = layers.find((l) => l.key === 'stadium_hum');
  assert.equal(hum?.startSec, 0);

  const bedLayers = layers.filter((l) => l.key === 'tension');
  assert.equal(bedLayers.length, 2, 'bed should produce a rise + a resume layer');
  // bed starts at scene 1's real start (0) and ends at scene 3's real pause
  // point (scene3Start + 2.0), not the config's target-duration sum.
  assert.equal(bedLayers[0].startSec, 0);
  assert.equal(bedLayers[0].endSec, scene3Start + 2.0);
  // resume layer starts at scene 3's real hit offset.
  assert.equal(bedLayers[1].startSec, scene3Start + 3.4);
  assert.equal(bedLayers[1].gainDb, -16);

  const heartbeat = layers.find((l) => l.key === 'heartbeat');
  assert.equal(heartbeat?.startSec, scene2Start + 1);
  assert.equal(heartbeat?.endSec, scene3Start + 2.0);
});
