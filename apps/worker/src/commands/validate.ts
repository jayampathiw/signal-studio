import { readFile } from 'node:fs/promises';

import { Manifest } from '@signal-studio/core/schemas';

import type { Logger } from '../logger.ts';

/**
 * Same behavior as `packages/core/src/cli/ss.ts`'s original `validate`
 * (P1.1) — reimplemented here rather than imported, since that file exports
 * nothing (it's a `main()`-only script, not a library); this CLI is now the
 * one with the full command set (`packages/core`'s own `ss` bin stays as a
 * lighter, DB-free validate-only tool for standalone schema-checking).
 */
export async function validateCommand(
  manifestPath: string | undefined,
  logger: Logger,
): Promise<number> {
  if (!manifestPath) {
    logger.error('Usage: ss validate <manifest.json>');
    return 1;
  }

  const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  const result = Manifest.safeParse(raw);

  if (result.success) {
    logger.info(`${manifestPath} is a valid manifest`, { shots: result.data.shots.length });
    return 0;
  }

  logger.error(`${manifestPath} is invalid`, {
    issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
  return 1;
}
