import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { pickTrack } from '@signal-studio/core/music';
import {
  MUSIC_LIBRARY_INDEX_KEY,
  MusicLibrary,
  musicTrackKey,
  type LibraryTrackT,
  type ManifestT,
  type MusicLibraryT,
} from '@signal-studio/core/schemas';
import type { ArtifactsRepo } from '@signal-studio/db/repos';
import type { StorageProvider } from '@signal-studio/providers/contracts';

import type { Logger } from './logger.ts';

export type ResolveMusicParams = {
  jobId: string;
  manifest: ManifestT;
  // Every platform the job's outputs/publish targets land on.
  platforms: string[];
  allowedIds: string[];
  storage: StorageProvider;
  fetchFn: typeof fetch;
  tmpDir: string;
  artifactsRepo: Pick<ArtifactsRepo, 'record'>;
  logger: Logger;
  // How much of the track the video plays — the part whose loudness counts.
  excerptSecs: number;
  measureLoudness?: (filePath: string, seconds: number) => Promise<number>;
};

// `gainDb` is set only for a loudness-matched library track; otherwise the
// manifest's own `gain_db` applies.
export type ResolvedMusic = { path: string; track?: LibraryTrackT; gainDb?: number };

const execFileAsync = promisify(execFile);

// Boost cap: an excerpt quieter than this is a near-silent intro, and
// matching it would amplify noise — fall back to `gain_db` instead.
const MAX_BOOST_DB = 6;
const NEAR_SILENT_LUFS = -50;

/** Integrated loudness (LUFS) of the first `seconds` of an audio file. */
export async function measureExcerptLufs(filePath: string, seconds: number): Promise<number> {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-t',
    String(seconds),
    '-i',
    filePath,
    '-af',
    'loudnorm=print_format=json',
    '-f',
    'null',
    '-',
  ]).catch((err: { stderr: string }) => err);
  const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  const lufs = match ? Number((JSON.parse(match[0]) as { input_i: string }).input_i) : NaN;
  if (!Number.isFinite(lufs)) throw new Error(`measureExcerptLufs: no loudness for ${filePath}`);
  return lufs;
}

const isRemoteUrl = (p: string) => /^https?:\/\//i.test(p);

/**
 * Track A (ADR-002) — turns `manifest.audio.music` into a local file (or a
 * URL) the render can mix in. Never throws: a missing library, an unknown
 * track id or a failed download all log a warning and render without music,
 * because a silent ending is better than a failed job.
 */
export async function resolveMusicBed(p: ResolveMusicParams): Promise<ResolvedMusic | undefined> {
  const music = p.manifest.audio.music;
  try {
    if (music.mode === 'none') return undefined;
    if (music.mode === 'in-app') {
      p.logger.info(
        'music: in-app mode — no music rendered; add a licensed sound in the FB/IG app when posting',
        {
          jobId: p.jobId,
        },
      );
      return undefined;
    }
    if (music.file && isRemoteUrl(music.file)) return { path: music.file };
    if (!music.file && !music.mood) {
      p.logger.info('music: no mood set — rendering without music', { jobId: p.jobId });
      return undefined;
    }

    const library = await loadLibrary(p);
    if (!library) return undefined;

    let track: LibraryTrackT | undefined;
    let pickMeta: Record<string, unknown> = {};
    if (music.file) {
      track = library.tracks.find((t) => t.id === music.file);
      if (!track) {
        p.logger.warn('music: requested track id not in the library — rendering without music', {
          jobId: p.jobId,
          file: music.file,
        });
        return undefined;
      }
      pickMeta = { requested: true };
    } else {
      const result = pickTrack(library, {
        jobId: p.jobId,
        platforms: p.platforms,
        mood: music.mood,
        allowedIds: p.allowedIds,
      });
      if (!result.track) {
        p.logger.warn(`music: ${result.reason} — rendering without music`, { jobId: p.jobId });
        return undefined;
      }
      track = result.track;
      pickMeta = { candidates: result.candidates, moodMatched: result.moodMatched };
    }

    const key = musicTrackKey(track);
    const res = await p.fetchFn(await p.storage.signedUrl(key));
    if (!res.ok) {
      p.logger.warn('music: track download failed — rendering without music', {
        jobId: p.jobId,
        key,
        status: res.status,
      });
      return undefined;
    }
    const dest = path.join(p.tmpDir, 'music', path.basename(key));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));

    const gainDb = await matchLoudness(p, dest);
    await p.artifactsRepo.record(p.jobId, 'music', 'music-bed', key, {
      trackId: track.id,
      mood: music.mood ?? null,
      source: track.source,
      gainDb: gainDb?.gainDb ?? music.gain_db,
      excerptLufs: gainDb?.excerptLufs ?? null,
      ...pickMeta,
    });
    p.logger.info('music: bed selected', {
      jobId: p.jobId,
      trackId: track.id,
      mood: music.mood,
      gainDb: gainDb?.gainDb ?? music.gain_db,
    });
    return { path: dest, track, gainDb: gainDb?.gainDb };
  } catch (err) {
    p.logger.warn('music: unexpected error — rendering without music', {
      jobId: p.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function matchLoudness(
  p: ResolveMusicParams,
  filePath: string,
): Promise<{ gainDb: number; excerptLufs: number } | undefined> {
  try {
    const excerptLufs = await (p.measureLoudness ?? measureExcerptLufs)(filePath, p.excerptSecs);
    if (excerptLufs < NEAR_SILENT_LUFS) {
      p.logger.warn('music: excerpt is near-silent — using gain_db', {
        jobId: p.jobId,
        excerptLufs,
      });
      return undefined;
    }
    const gainDb = Math.min(p.manifest.audio.music.bed_lufs - excerptLufs, MAX_BOOST_DB);
    return { gainDb: Math.round(gainDb * 10) / 10, excerptLufs };
  } catch (err) {
    p.logger.warn('music: loudness measurement failed — using gain_db', {
      jobId: p.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function loadLibrary(p: ResolveMusicParams): Promise<MusicLibraryT | undefined> {
  const res = await p.fetchFn(await p.storage.signedUrl(MUSIC_LIBRARY_INDEX_KEY));
  if (!res.ok) {
    p.logger.warn(
      'music: no library index in storage — rendering without music (run `ss music sync`)',
      {
        jobId: p.jobId,
        status: res.status,
      },
    );
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await res.text());
  } catch {
    p.logger.warn('music: library index is not valid JSON — rendering without music', {
      jobId: p.jobId,
    });
    return undefined;
  }
  const parsed = MusicLibrary.safeParse(raw);
  if (!parsed.success) {
    p.logger.warn('music: library index failed validation — rendering without music', {
      jobId: p.jobId,
      issues: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return undefined;
  }
  return parsed.data;
}
