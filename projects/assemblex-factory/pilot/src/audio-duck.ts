// Shared by Post and Compilation — both duck a continuous music bed under
// per-shot VO windows the same way.

export const DUCK_RAMP_FRAMES = 12;
export const DUCK_FACTOR = 0.4;

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

// Ramped gain multiplier: 1.0 outside every VO window, DUCK_FACTOR inside one,
// with a linear ramp across DUCK_RAMP_FRAMES at each edge. `windows` are
// absolute [start, end] frame pairs, one per shot's VO.
export function duckMultiplier(frame: number, windows: Array<[number, number]>): number {
  for (const [start, end] of windows) {
    if (frame >= start - DUCK_RAMP_FRAMES && frame < start) {
      const t = (frame - (start - DUCK_RAMP_FRAMES)) / DUCK_RAMP_FRAMES;
      return 1 - t * (1 - DUCK_FACTOR);
    }
    if (frame >= start && frame <= end) {
      return DUCK_FACTOR;
    }
    if (frame > end && frame <= end + DUCK_RAMP_FRAMES) {
      const t = (frame - end) / DUCK_RAMP_FRAMES;
      return DUCK_FACTOR + t * (1 - DUCK_FACTOR);
    }
  }
  return 1;
}
