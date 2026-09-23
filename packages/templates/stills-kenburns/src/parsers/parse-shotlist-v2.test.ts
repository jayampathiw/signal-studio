import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseShotlistText, tcToSec } from './parse-shotlist-v2.ts';

const SAMPLE = `**TITLE:** Test Documentary
**TARGET_DURATION_SEC:** 100

## COLD OPEN

**SCENE 1 — 0:00–0:06 (6s)**
🖼️ STILL A: A goalkeeper alone under stadium lights [WIDE]
🎞️ PUSH
🎙️ "Imagine you are twenty-six years old."
🔊 Stadium hum rises
📝 TIER 1 at 0:01: **26** — amber "26", upper right. 3s.

**SCENE 2 — 0:06–0:21 (15s)** · WARM
🖼️ STILL A: Close on his hands
🖼️ STILL B: Wide shot of the pitch
🎞️ A: PUSH B: micro-PUSH
🎙️ "He was the best in the world, briefly."
🔤 running caption — lower third. holds ~2s.

**SCENE 3 — 0:21–0:25 (4s)**
📝 TIER 1 at 0:21: **THE FALL** — center-low. 4s.
`;

test('parseShotlistText: title/target duration header', () => {
  const { title, target_duration_sec } = parseShotlistText(SAMPLE);
  assert.equal(title, 'Test Documentary');
  assert.equal(target_duration_sec, 100);
});

test('parseShotlistText: scene header fields (n, timecodes, duration, grade)', () => {
  const { scenes } = parseShotlistText(SAMPLE);
  assert.equal(scenes.length, 3);
  assert.equal(scenes[0].scene_n, 1);
  assert.equal(scenes[0].from_tc, '0:00');
  assert.equal(scenes[0].to_tc, '0:06');
  assert.equal(scenes[0].duration_sec, 6);
  assert.equal(scenes[0].grade, null);
  assert.equal(scenes[1].grade, 'WARM');
});

test('parseShotlistText: stills parsed per cut with reference-key extraction', () => {
  const { scenes } = parseShotlistText(SAMPLE);
  assert.equal(scenes[0].stills.length, 1);
  assert.equal(scenes[0].stills[0].cut, 'A');
  assert.deepEqual(scenes[0].stills[0].reference_keys, ['WIDE']);
  assert.equal(scenes[1].stills.length, 2);
  assert.equal(scenes[1].stills[1].cut, 'B');
});

test('parseShotlistText: per-cut motion resolved from the 🎞️ line', () => {
  const { scenes } = parseShotlistText(SAMPLE);
  assert.equal(scenes[0].still_motions[0].motion, 'push');
  assert.deepEqual(
    scenes[1].still_motions.map((m) => [m.cut, m.motion]),
    [
      ['A', 'push'],
      ['B', 'micro_push'],
    ],
  );
});

test('parseShotlistText: VO text and audio cue captured verbatim', () => {
  const { scenes } = parseShotlistText(SAMPLE);
  assert.equal(scenes[0].vo_text, 'Imagine you are twenty-six years old.');
  assert.equal(scenes[0].audio_cue, 'Stadium hum rises');
});

test('parseShotlistText: TIER 1 hero-card overlay parsed with amber word + zone + duration', () => {
  const { scenes } = parseShotlistText(SAMPLE);
  const ov = scenes[0].overlays[0];
  assert.equal(ov.tier, 1);
  assert.equal(ov.text, '26');
  assert.equal(ov.amber_word, '26');
  assert.equal(ov.zone, 'upper right');
  assert.equal(ov.duration_sec, 3);
  assert.equal(ov.at_sec, tcToSec('0:01'));
});

test('parseShotlistText: 🔤 tier-2 running-caption line parsed as tier 2', () => {
  const { scenes } = parseShotlistText(SAMPLE);
  const ov = scenes[1].overlays[0];
  assert.equal(ov.tier, 2);
  assert.equal(ov.duration_sec, 2);
});

test('parseShotlistText: a scene with zero 🖼️ lines has no stills (title-card candidate)', () => {
  const { scenes } = parseShotlistText(SAMPLE);
  assert.deepEqual(scenes[2].stills, []);
});

test('tcToSec: mm:ss to seconds', () => {
  assert.equal(tcToSec('1:30'), 90);
  assert.equal(tcToSec('0:05'), 5);
});
