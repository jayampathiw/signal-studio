import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cache = new Map();

/**
 * Load a prompt file from prompts/ (shared) or apps/<app>/prompts/ (app-specific).
 * Results are cached in-process.
 *
 * @param {string} relativePath  e.g. 'system/content-system.v3.md' or 'tasks/image-prompt.v1.md'
 * @param {{ app?: string }} opts  app name to look in apps/<app>/prompts/ first
 * @returns {string}
 */
export function loadPrompt(relativePath, { app } = {}) {
  const key = `${app ?? 'shared'}/${relativePath}`;
  if (cache.has(key)) return cache.get(key);

  const candidates = app
    ? [
        resolve(repoRoot, 'apps', app, 'prompts', relativePath),
        resolve(repoRoot, 'prompts', relativePath),
      ]
    : [resolve(repoRoot, 'prompts', relativePath)];

  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf8');
      cache.set(key, text);
      return text;
    } catch {}
  }

  throw new Error(`Prompt not found: ${relativePath} (searched ${candidates.join(', ')})`);
}
