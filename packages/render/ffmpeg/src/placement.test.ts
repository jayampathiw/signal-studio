import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolvePlacement, DEFAULT_ANCHOR, ANCHORS } from './placement.ts';

test('resolvePlacement: matches compound phrases before generic fallbacks', () => {
  assert.equal(resolvePlacement('lower-right dark void beside the gloves').anchor, 'lower_right');
  assert.equal(resolvePlacement('center-low, under the crossbar').anchor, 'center_low');
  assert.equal(resolvePlacement('upper sky area').anchor, 'upper_center');
});

test('resolvePlacement: falls back to the default anchor with matched=false for no/unknown text', () => {
  const none = resolvePlacement(undefined);
  assert.equal(none.anchor, DEFAULT_ANCHOR);
  assert.equal(none.matched, false);

  const unknown = resolvePlacement('somewhere weird nobody described');
  assert.equal(unknown.anchor, DEFAULT_ANCHOR);
  assert.equal(unknown.matched, false);
});

test('resolvePlacement: real match carries the real anchor coordinates', () => {
  const result = resolvePlacement('right third');
  assert.equal(result.x, ANCHORS.right_mid.x);
  assert.equal(result.y, ANCHORS.right_mid.y);
  assert.equal(result.matched, true);
});
