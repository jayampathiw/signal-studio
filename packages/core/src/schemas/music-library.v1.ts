import { z } from 'zod';

/**
 * Track A (ADR-002) — the shared background-music library. One index for
 * every project: committed as `projects/music/library.yaml` (the licence
 * record), published by `ss music sync` as `music/library.json` next to the
 * audio itself, which is what the worker reads at job time — so adding a
 * track never needs a new worker image.
 */

export const MUSIC_SOURCES = [
  'pixabay',
  'youtube-audio-library',
  'meta-sound-collection',
  'flow-music',
  'freesound',
  'jamendo',
  'ai-batch',
] as const;

export const LibraryTrack = z.object({
  // Stable id, also the R2 key stem (`music/<id><ext>`) — so lowercase,
  // no spaces, safe in a URL path.
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes only'),
  file: z.string().min(1),
  source: z.enum(MUSIC_SOURCES),
  licence: z.string().min(1),
  source_url: z.string().url().optional(),
  author: z.string().optional(),
  // Credit line the licence requires, appended to captions; null when none.
  attribution: z.string().nullable().default(null),
  // 'all', or the only platforms the licence allows (Meta Sound Collection
  // → ['facebook', 'instagram']).
  platforms: z.union([z.literal('all'), z.array(z.string()).min(1)]).default('all'),
  moods: z.array(z.string()).default([]),
  duration_s: z.number().positive().optional(),
  enabled: z.boolean().default(true),
  added: z.string().optional(),
  notes: z.string().optional(),
});

export const MusicLibrary = z
  .object({
    version: z.literal(1),
    tracks: z.array(LibraryTrack),
  })
  .superRefine((lib, ctx) => {
    const seen = new Set<string>();
    lib.tracks.forEach((t, i) => {
      if (seen.has(t.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['tracks', i, 'id'],
          message: `duplicate track id "${t.id}"`,
        });
      }
      seen.add(t.id);
    });
  });

export type LibraryTrackT = z.infer<typeof LibraryTrack>;
export type MusicLibraryT = z.infer<typeof MusicLibrary>;

export const MUSIC_LIBRARY_INDEX_KEY = 'music/library.json';

export function musicTrackKey(track: Pick<LibraryTrackT, 'id' | 'file'>): string {
  const dot = track.file.lastIndexOf('.');
  const ext = dot > 0 ? track.file.slice(dot).toLowerCase() : '';
  return `music/${track.id}${ext}`;
}
