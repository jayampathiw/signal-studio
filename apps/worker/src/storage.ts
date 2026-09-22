import { createLocalStorageProvider } from '@signal-studio/providers/storage-local';
import { createR2StorageProvider, readR2ConfigFromEnv } from '@signal-studio/providers/storage-r2';
import type { StorageProvider } from '@signal-studio/providers/contracts';

/** Picks a real StorageProvider by the id `resolveJob()` resolved (`project.providers.storage`). */
export function createStorageProviderFor(
  providerId: string,
  opts: { localRoot?: string } = {},
): StorageProvider {
  if (providerId === 'r2') return createR2StorageProvider(readR2ConfigFromEnv());
  if (providerId === 'local') return createLocalStorageProvider(opts.localRoot ?? '.');
  throw new Error(`Unsupported storage provider "${providerId}" (expected "r2" or "local")`);
}
