/**
 * Auto-zoom for document scenes (P.13): a page shown whole is too small to
 * read on a phone in 9:16, and nobody in the claude.ai chat has page
 * coordinates to author `zoomFrom`/`zoomTo`. The highlight boxes already say
 * where the evidence is, so the camera opens on the whole page, then pushes
 * in to each highlight beat (boxes sharing a `fromSec` — one quote can span
 * lines) shortly before it appears, panning between beats and holding on
 * the last one.
 *
 * Pure (no Remotion imports) so it can be unit-tested with node --test.
 * Regions and boxes are fractions (0–1) of the page image, the same space
 * `DocumentHighlight` uses for `zoomFrom`/`zoomTo`.
 */

export type Region = { x: number; y: number; width: number; height: number };
export type TimedBox = Region & { fromSec: number; toSec: number };
export type CameraKey = { atSec: number; region: Region };

export const FULL_PAGE: Region = { x: 0, y: 0, width: 1, height: 1 };

// Closest view: 1 / MIN_SPAN ≈ 1.7× the whole-page view, enough to read
// body text on a phone while keeping most of the line.
const MIN_SPAN = 0.58;
const MARGIN_X = 0.06;
const MARGIN_Y = 0.05;
// The page stays whole this long before the first push.
const OPENING_SEC = 0.4;
// The camera starts moving this long before a beat's box appears.
const LEAD_SEC = 0.3;
const MOVE_SEC = 0.9;

/**
 * `pageAspect` / `frameAspect` are width ÷ height of the page image and of
 * the video frame. Returns [] when there's nothing to zoom to.
 */
export function planAutoZoom(
  boxes: TimedBox[],
  opts: { pageAspect: number; frameAspect: number; durationSec: number },
): CameraKey[] {
  const beats = groupBeats(boxes);
  if (beats.length === 0) return [];

  const keys: CameraKey[] = [{ atSec: 0, region: FULL_PAGE }];
  let current = FULL_PAGE;
  let ready = OPENING_SEC;
  for (const beat of beats) {
    const target = regionFor(beat.union, opts.pageAspect, opts.frameAspect);
    const start = Math.min(Math.max(ready, beat.fromSec - LEAD_SEC), opts.durationSec);
    const end = Math.min(start + MOVE_SEC, opts.durationSec);
    if (end <= start) break;
    keys.push({ atSec: start, region: current }, { atSec: end, region: target });
    current = target;
    ready = end;
  }
  return keys;
}

/** The camera region at `t` seconds, eased between keys. */
export function regionAt(keys: CameraKey[], t: number): Region {
  if (keys.length === 0) return FULL_PAGE;
  if (t <= keys[0]!.atSec) return keys[0]!.region;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    if (t <= b.atSec) {
      const span = b.atSec - a.atSec;
      const p = span <= 0 ? 1 : easeInOut((t - a.atSec) / span);
      return {
        x: a.region.x + (b.region.x - a.region.x) * p,
        y: a.region.y + (b.region.y - a.region.y) * p,
        width: a.region.width + (b.region.width - a.region.width) * p,
        height: a.region.height + (b.region.height - a.region.height) * p,
      };
    }
  }
  return keys[keys.length - 1]!.region;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

function groupBeats(boxes: TimedBox[]): Array<{ fromSec: number; union: Region }> {
  const byStart = new Map<number, Region>();
  for (const b of [...boxes].sort((p, q) => p.fromSec - q.fromSec)) {
    const key = Math.round(b.fromSec * 100) / 100;
    const u = byStart.get(key);
    if (!u) {
      byStart.set(key, { x: b.x, y: b.y, width: b.width, height: b.height });
      continue;
    }
    const right = Math.max(u.x + u.width, b.x + b.width);
    const bottom = Math.max(u.y + u.height, b.y + b.height);
    u.x = Math.min(u.x, b.x);
    u.y = Math.min(u.y, b.y);
    u.width = right - u.x;
    u.height = bottom - u.y;
  }
  return [...byStart].map(([fromSec, union]) => ({ fromSec, union }));
}

// The smallest frame-shaped region that holds the beat with a margin,
// centred on it, never closer than MIN_SPAN and never wider than the
// whole-page view. Regions are in page fractions and may reach past the page
// on the side where the page doesn't fill the frame (the navy around it).
function regionFor(union: Region, pageAspect: number, frameAspect: number): Region {
  // A region w wide (page fraction) shows w·pageAspect/frameAspect of the
  // page height when it fills the frame's shape.
  const heightPerWidth = pageAspect / frameAspect;
  // The whole page fills the frame's width when the page is the wider shape
  // (a letter page in 9:16) and its height otherwise (16:9): the zoom limit
  // and the whole-page view are measured on that side.
  const fitsWidth = heightPerWidth >= 1;
  const minWidth = fitsWidth ? MIN_SPAN : MIN_SPAN / heightPerWidth;
  const maxWidth = fitsWidth ? 1 : 1 / heightPerWidth;
  const width = Math.min(
    maxWidth,
    Math.max(minWidth, union.width + 2 * MARGIN_X, (union.height + 2 * MARGIN_Y) / heightPerWidth),
  );
  const height = width * heightPerWidth;
  return {
    x: place(union.x + union.width / 2, width),
    y: place(union.y + union.height / 2, height),
    width,
    height,
  };
}

// Centres a span on `centre`, kept inside the page; a span wider than the
// page is centred on the page instead.
function place(centre: number, size: number): number {
  if (size >= 1) return (1 - size) / 2;
  return Math.min(Math.max(centre - size / 2, 0), 1 - size);
}
