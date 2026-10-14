import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { StorageProvider, StorageResultT } from './contracts.ts';

/**
 * P2.4 — filesystem-backed StorageProvider for `ss run-local` mode (no DB,
 * writes artifacts to `out/`, per §2.5). `put` copies the file into
 * `<root>/<key>`; there's no real "signing" for local files, so
 * `signedUrl`/`presignUpload` both just return a `file://` URL to the same
 * path — good enough for a local dev loop where nothing needs auth to read
 * or write the filesystem it's already running on.
 */
export function createLocalStorageProvider(root: string): StorageProvider {
  return {
    async put({ localPath, key }): Promise<StorageResultT> {
      const dest = path.join(root, key);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(localPath, dest);
      return { url: pathToFileURL(dest).href };
    },
    async signedUrl(key: string): Promise<string> {
      return pathToFileURL(path.join(root, key)).href;
    },
    async presignUpload(key: string): Promise<string> {
      return pathToFileURL(path.join(root, key)).href;
    },
  };
}
