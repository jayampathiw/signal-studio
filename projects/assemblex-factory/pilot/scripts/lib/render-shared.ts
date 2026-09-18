import { readFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';

import { Pack, type PackT } from '../../src/manifest.ts';

export const PILOT_ROOT = path.resolve(import.meta.dirname, '..', '..');
export const CONTENT_ROOT = path.resolve(PILOT_ROOT, '..', 'content');
export const PUBLIC_DIR = path.resolve(PILOT_ROOT, 'public');
export const STAGE_ROOT = path.join(PUBLIC_DIR, 'staged');
export const PAGE_NAME = 'AssembleX Factory'; // placeholder — see P0.8-05 note; not in Pack schema yet

export async function loadPack(dir: string): Promise<PackT> {
  const raw = JSON.parse(await readFile(path.join(dir, 'pack.json'), 'utf8'));
  return Pack.parse(raw);
}

export function contentBaseFor(dir: string): string {
  return 'staged/' + path.relative(CONTENT_ROOT, dir).split(path.sep).join('/');
}

// The bundle()+renderMedia() programmatic path stages the public dir into a
// tmp webpack bundle directory and does not follow the public/content symlink
// (that symlink only works for CLI commands — `remotion still`/`compositions`
// — which serve straight off disk). So for actual renders we stage real file
// copies of just what's referenced, once, before the single bundle() call.
// Excludes clips/raw/ (unprepped source footage, irrelevant to rendering and
// large) to keep the copy small — a smaller copy means less time for bundle()'s
// own async public-dir snapshot to race against Chrome's first asset request.
const skipRaw = (src: string) => !src.split(path.sep).includes('raw');

export async function resetStage(): Promise<void> {
  await rm(STAGE_ROOT, { recursive: true, force: true });
}

export async function stageDirAssets(dir: string, contentBase: string): Promise<void> {
  const stageDir = path.join(PUBLIC_DIR, contentBase);
  await cp(path.join(dir, 'clips'), path.join(stageDir, 'clips'), {
    recursive: true,
    filter: skipRaw,
  });
  await cp(path.join(dir, 'vo'), path.join(stageDir, 'vo'), { recursive: true });
}
