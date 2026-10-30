import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FULL_PAGE, planAutoZoom, regionAt, type TimedBox } from './auto-zoom.ts';

// A US-letter page in a 9:16 frame.
const OPTS = { pageAspect: 8.5 / 11, frameAspect: 9 / 16, durationSec: 8 };

function box(x: number, y: number, width: number, height: number, fromSec: number): TimedBox {
  return { x, y, width, height, fromSec, toSec: fromSec + 0.5 };
}

test('opens on the whole page, then pushes in around the highlight', () => {
  const keys = planAutoZoom([box(0.4, 0.6, 0.3, 0.02, 1)], OPTS);
  assert.deepEqual(regionAt(keys, 0), FULL_PAGE);
  assert.deepEqual(regionAt(keys, 0.5), FULL_PAGE);
  const end = regionAt(keys, 8);
  assert.ok(end.width < 0.6, `zoomed in (width ${end.width})`);
  // Frame-shaped: px aspect of the region equals the frame's.
  const pxAspect = (end.width * OPTS.pageAspect) / end.height;
  assert.ok(Math.abs(pxAspect - OPTS.frameAspect) < 1e-9);
  // Holds the highlight with room around it.
  assert.ok(end.x <= 0.4 && end.x + end.width >= 0.7);
  assert.ok(end.y <= 0.6 && end.y + end.height >= 0.62);
  // Arrives within the lead + move time.
  assert.deepEqual(regionAt(keys, 1.6), end);
});

test('a quote over two lines is one beat; a later beat pans to it', () => {
  const keys = planAutoZoom(
    [box(0.1, 0.3, 0.8, 0.02, 1), box(0.1, 0.32, 0.3, 0.02, 1), box(0.2, 0.8, 0.3, 0.02, 4)],
    OPTS,
  );
  const first = regionAt(keys, 3);
  assert.ok(first.x <= 0.1 && first.x + first.width >= 0.9, 'wide quote kept whole');
  const second = regionAt(keys, 8);
  assert.ok(second.y + second.height >= 0.82 && second.y <= 0.8);
  assert.notDeepEqual(first, second);
});

test('regions stay inside the page near its edges', () => {
  const keys = planAutoZoom([box(0.9, 0.97, 0.08, 0.02, 0.5)], OPTS);
  const r = regionAt(keys, 8);
  assert.ok(r.x >= 0 && r.y >= 0);
  assert.ok(r.x + r.width <= 1 + 1e-9 && r.y + r.height <= 1 + 1e-9);
});

test('a beat wider than the closest view never zooms out past the whole page', () => {
  const r = regionAt(planAutoZoom([box(0, 0.1, 1, 0.8, 0.5)], OPTS), 8);
  assert.equal(r.width, 1);
  assert.ok(Math.abs(r.y + r.height / 2 - 0.5) < 1e-9, 'centred on the page');
});

test('no highlights → no camera plan; a highlight at the very end does not move', () => {
  assert.deepEqual(planAutoZoom([], OPTS), []);
  const keys = planAutoZoom([box(0.4, 0.5, 0.2, 0.02, 9)], { ...OPTS, durationSec: 8 });
  assert.deepEqual(regionAt(keys, 8), FULL_PAGE);
});

test('16:9 caps the zoom relative to the whole-page view', () => {
  const landscape = { pageAspect: 8.5 / 11, frameAspect: 16 / 9, durationSec: 8 };
  const r = regionAt(planAutoZoom([box(0.4, 0.5, 0.1, 0.02, 1)], landscape), 8);
  // The whole page fills the frame height there, so zoom = 1 / region height.
  assert.ok(Math.abs(1 / r.height - 1 / 0.58) < 1e-9, `zoom ${1 / r.height}`);
});
