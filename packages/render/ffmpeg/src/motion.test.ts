import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMotionFilter, buildDrawtext } from './motion.ts';

test('buildMotionFilter: "static" bypasses the overscan prescale (pad, not crop-from-canvas)', () => {
  const vf = buildMotionFilter({ motion: 'static', durationSec: 3 });
  assert.ok(vf.startsWith('scale=1920:1080:force_original_aspect_ratio=decrease'));
  assert.ok(vf.includes('pad=1920:1080'));
  assert.ok(!vf.includes('crop=3840')); // no 1.5x*2 overscan canvas
});

test('buildMotionFilter: "hold" crops a fixed window from the overscanned canvas, no zoom expression', () => {
  const vf = buildMotionFilter({ motion: 'hold', durationSec: 3 });
  assert.ok(vf.includes('crop=w=1920:h=1080'));
  assert.ok(!vf.includes('eval=frame')); // no per-frame zoom scale
});

test('buildMotionFilter: "push" produces a per-frame zoom scale expression using t', () => {
  const vf = buildMotionFilter({ motion: 'push', durationSec: 5 });
  assert.ok(vf.includes('eval=frame'));
  assert.ok(vf.includes('1+0.22*min(t'));
});

test('buildMotionFilter: regrade appends the matching colorbalance filter', () => {
  const warm = buildMotionFilter({ motion: 'hold', durationSec: 2, regrade: 'warm_amber' });
  assert.ok(warm.includes('colorbalance=rs=0.1'));
  const cold = buildMotionFilter({ motion: 'hold', durationSec: 2, regrade: 'cold_blue' });
  assert.ok(cold.includes('colorbalance=rs=-0.1'));
  const none = buildMotionFilter({ motion: 'hold', durationSec: 2 });
  assert.ok(!none.includes('colorbalance'));
});

test('buildMotionFilter: portrait frame (height > width) still resolves without throwing', () => {
  const vf = buildMotionFilter({ motion: 'pan_lr', durationSec: 4, width: 1080, height: 1920 });
  assert.ok(vf.includes('scale=1080:1920'));
});

test('buildDrawtext: legacy overlay with no at_sec has no enable window', () => {
  const dt = buildDrawtext({ text: 'hello', style: 'stamp' });
  assert.ok(dt?.startsWith("drawtext=text='hello'"));
  assert.ok(!dt?.includes('enable='));
});

test('buildDrawtext: legacy overlay with at_sec gets a 4s enable window', () => {
  const dt = buildDrawtext({ at_sec: 10, text: 'hello', style: 'small_cream' });
  assert.ok(dt?.includes("enable='between(t,10,14)'"));
});

test('buildDrawtext: null/no-text overlay renders nothing', () => {
  assert.equal(buildDrawtext(null), null);
  assert.equal(buildDrawtext({ text: '' } as never), null);
});
