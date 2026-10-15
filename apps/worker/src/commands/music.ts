import { readdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  MUSIC_LIBRARY_INDEX_KEY,
  MusicLibrary,
  musicTrackKey,
  type MusicLibraryT,
} from '@signal-studio/core/schemas';
import type { StorageProvider } from '@signal-studio/providers/contracts';
import { load as loadYaml } from 'js-yaml';

import type { Logger } from '../logger.ts';

/**
 * Track A (ADR-002) — `ss music sync` / `ss music list`.
 *
 * `sync` makes R2 match the committed `library.yaml` + the local folder of
 * audio files: uploads each track that isn't in storage yet (as
 * `music/<id><ext>`), measures durations, then publishes the validated
 * index as `music/library.json` — the only thing the worker reads. Nothing
 * is uploaded if the yaml is invalid or any listed file is missing locally.
 */

const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac)$/i;

export type MusicSyncOptions = {
  libraryPath: string;
  dir: string;
  force?: boolean;
  dryRun?: boolean;
};

export type MusicDeps = {
  storage: StorageProvider;
  fetchFn: typeof fetch;
  probeDuration: (filePath: string) => number;
};

export type MusicSyncResult = {
  uploaded: string[];
  skipped: string[];
  extraFiles: string[];
  index: MusicLibraryT;
};

export async function readLibraryYaml(libraryPath: string): Promise<MusicLibraryT> {
  const parsed = MusicLibrary.safeParse(loadYaml(await readFile(libraryPath, 'utf8')));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`music: ${libraryPath} is invalid:\n${issues}`);
  }
  return parsed.data;
}

export async function musicSyncCommand(
  opts: MusicSyncOptions,
  deps: MusicDeps,
  logger: Logger,
): Promise<MusicSyncResult> {
  const library = await readLibraryYaml(opts.libraryPath);

  const localFiles = new Set((await readdir(opts.dir)).filter((f) => AUDIO_EXT.test(f)));
  const missing = library.tracks.filter((t) => !localFiles.has(t.file)).map((t) => t.file);
  if (missing.length > 0) {
    throw new Error(
      `music: listed in ${opts.libraryPath} but not in ${opts.dir}: ${missing.join(', ')}`,
    );
  }
  const listed = new Set(library.tracks.map((t) => t.file));
  const extraFiles = [...localFiles].filter((f) => !listed.has(f)).sort();
  if (extraFiles.length > 0) {
    logger.warn('music: audio files in the folder but not in library.yaml (not synced)', {
      extraFiles,
    });
  }

  const index: MusicLibraryT = {
    version: 1,
    tracks: library.tracks.map((t) => ({
      ...t,
      duration_s: Math.round(deps.probeDuration(path.join(opts.dir, t.file)) * 10) / 10,
    })),
  };

  const uploaded: string[] = [];
  const skipped: string[] = [];
  for (const track of index.tracks) {
    const key = musicTrackKey(track);
    if (!opts.force && (await existsInStorage(deps, key))) {
      skipped.push(key);
      continue;
    }
    if (!opts.dryRun) await deps.storage.put({ localPath: path.join(opts.dir, track.file), key });
    uploaded.push(key);
  }

  if (!opts.dryRun) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ss-music-'));
    try {
      const indexPath = path.join(tmp, 'library.json');
      await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
      await deps.storage.put({ localPath: indexPath, key: MUSIC_LIBRARY_INDEX_KEY });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  logger.info(opts.dryRun ? 'music sync (dry run): nothing written' : 'music sync done', {
    tracks: index.tracks.length,
    uploaded: uploaded.length,
    alreadyInStorage: skipped.length,
  });
  return { uploaded, skipped, extraFiles, index };
}

export async function musicListCommand(
  deps: MusicDeps,
  logger: Logger,
): Promise<MusicLibraryT | undefined> {
  const res = await deps.fetchFn(await deps.storage.signedUrl(MUSIC_LIBRARY_INDEX_KEY));
  if (!res.ok) {
    logger.warn('music: no library index in storage yet — run `ss music sync`', {
      status: res.status,
    });
    return undefined;
  }
  const library = MusicLibrary.parse(await res.json());
  for (const t of library.tracks) {
    logger.info(t.id, {
      moods: t.moods,
      platforms: t.platforms,
      source: t.source,
      duration_s: t.duration_s,
      enabled: t.enabled,
    });
  }
  return library;
}

async function existsInStorage(deps: MusicDeps, key: string): Promise<boolean> {
  const res = await deps.fetchFn(await deps.storage.signedUrl(key), {
    headers: { Range: 'bytes=0-0' },
  });
  return res.ok;
}
