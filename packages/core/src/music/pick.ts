import { createHash } from 'node:crypto';

import type { LibraryTrackT, MusicLibraryT } from '../schemas/music-library.v1.ts';

export type PickTrackParams = {
  jobId: string;
  // Every platform the job publishes to — a track must be allowed on all.
  platforms: string[];
  mood?: string;
  // The project's `brand.musicBeds`; empty means every library track.
  allowedIds?: string[];
};

export type PickTrackResult =
  | { track: LibraryTrackT; candidates: number; moodMatched: boolean }
  | { track: undefined; reason: string };

/**
 * Track A (ADR-002) — deterministic: the same job against the same library
 * always gets the same track, so a retry or re-render never swaps music.
 * Different jobs spread across the candidates via the job-id hash.
 */
export function pickTrack(library: MusicLibraryT, params: PickTrackParams): PickTrackResult {
  const allowed = new Set(params.allowedIds ?? []);
  let pool = library.tracks.filter(
    (t) =>
      t.enabled &&
      (t.platforms === 'all' || params.platforms.every((p) => t.platforms.includes(p))) &&
      (allowed.size === 0 || allowed.has(t.id)),
  );
  if (pool.length === 0) {
    return {
      track: undefined,
      reason:
        library.tracks.length === 0
          ? 'music library is empty'
          : `no enabled track allowed on [${params.platforms.join(', ')}]${allowed.size ? ' within brand.musicBeds' : ''}`,
    };
  }

  let moodMatched = false;
  if (params.mood) {
    const byMood = pool.filter((t) => t.moods.includes(params.mood as string));
    if (byMood.length > 0) {
      pool = byMood;
      moodMatched = true;
    }
  }

  pool = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const index = createHash('sha256').update(params.jobId).digest().readUInt32BE(0) % pool.length;
  return { track: pool[index], candidates: pool.length, moodMatched };
}
