import type { StorageProvider } from '@signal-studio/providers/contracts';
import { createLocalStorageProvider } from '@signal-studio/providers/storage-local';
import { createR2StorageProvider, readR2ConfigFromEnv } from '@signal-studio/providers/storage-r2';

/**
 * Identical to `apps/worker/src/storage.ts` — deliberately duplicated rather
 * than importing across `apps/*` (unusual dependency direction) or spinning
 * up a shared package for 5 lines. Revisit if a third `apps/*` package ever
 * needs the same thing.
 */
export function createStorageProviderFor(
  providerId: string,
  opts: { localRoot?: string } = {},
): StorageProvider {
  if (providerId === 'r2') return createR2StorageProvider(readR2ConfigFromEnv());
  if (providerId === 'local') return createLocalStorageProvider(opts.localRoot ?? '.');
  throw new Error(`Unsupported storage provider "${providerId}" (expected "r2" or "local")`);
}
