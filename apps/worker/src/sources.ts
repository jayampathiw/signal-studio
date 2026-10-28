import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';

import type { ManifestT } from '@signal-studio/core/schemas';
import { NonRetryableError } from '@signal-studio/core/state';
import type { StorageProvider } from '@signal-studio/providers/contracts';

import type { Logger } from './logger.ts';

/**
 * Track P (ADR-003) — resolves every `shot.source` into the same R2 key an
 * upload would have used (`jobs/<id>/uploads/<shot>/<file>`) and returns the
 * shots with `image`/`clip` filled in, so templates never see `source`.
 * Already-fetched files are reused (cheap ranged GET on R2), so a retry never
 * hits the source site again.
 */
export type ResolveSourcesParams = {
  jobId: string;
  manifest: ManifestT;
  storage: StorageProvider;
  fetchFn: typeof fetch;
  tmpDir: string;
  logger: Logger;
  maxBytes?: number;
  timeoutMs?: number;
};

type Kind = 'image' | 'clip';

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const USER_AGENT = 'signal-studio-worker/0.1 (asset fetcher)';
const KNOWN_EXT: Record<Kind, string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  clip: ['.mp4', '.mov', '.webm', '.m4v'],
};

// Templates whose shots are video clips; every other shot-based template
// (case-file, …) takes stills.
const CLIP_TEMPLATES = new Set(['clips-overlay', 'compilation']);

export async function resolveShotSources(
  params: ResolveSourcesParams,
): Promise<ManifestT['shots']> {
  const { manifest } = params;
  if (!manifest.shots.some((s) => s.source)) return manifest.shots;
  const kind: Kind = CLIP_TEMPLATES.has(manifest.visual.mode) ? 'clip' : 'image';

  const shots: ManifestT['shots'] = [];
  for (const shot of manifest.shots) {
    if (!shot.source) {
      shots.push(shot);
      continue;
    }
    const file = await resolveUrl(params, shot.id, shot.source.url, kind);
    shots.push({ ...shot, [kind]: file });
  }
  return shots;
}

export function sourceFileName(url: string, kind: Kind): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return `source-${hash}${KNOWN_EXT[kind].includes(ext) ? ext : kind === 'clip' ? '.mp4' : '.jpg'}`;
}

async function resolveUrl(
  params: ResolveSourcesParams,
  shotId: string,
  url: string,
  kind: Kind,
): Promise<string> {
  const { jobId, storage, fetchFn, tmpDir, logger } = params;
  const file = sourceFileName(url, kind);
  const key = `jobs/${jobId}/uploads/${shotId}/${file}`;

  const cached = await fetchFn(await storage.signedUrl(key), {
    headers: { Range: 'bytes=0-0' },
  }).catch(() => null);
  if (cached?.ok) {
    await cached.body?.cancel();
    logger.info('source already fetched', { jobId, shotId, key });
    return file;
  }

  const fail = (reason: string, retryable = false) => {
    const Err = retryable ? Error : NonRetryableError;
    return new Err(`run-job: shot "${shotId}" source ${url} — ${reason}`);
  };

  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHost(host)) throw fail('private or local addresses are not allowed');

  let res: Response;
  try {
    res = await fetchFn(url, {
      // Some sites (Wikimedia, many CDNs) refuse requests with Node's default
      // user agent.
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    throw fail(`download failed (${(err as Error).message})`, true);
  }
  if (!res.ok) {
    throw fail(`download failed with HTTP ${res.status}`, res.status >= 500 || res.status === 429);
  }

  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const wanted = kind === 'clip' ? 'video/' : 'image/';
  if (!type.startsWith(wanted)) {
    await res.body?.cancel();
    throw fail(`expected ${wanted}* for this template, got "${type || 'no content-type'}"`);
  }

  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES;
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) {
    await res.body?.cancel();
    throw fail(`larger than ${maxBytes} bytes`);
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > maxBytes) throw fail(`larger than ${maxBytes} bytes`);
  if (body.length === 0) throw fail('empty response');

  const localPath = path.join(tmpDir, 'sources', shotId, file);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, body);
  await storage.put({ localPath, key });
  await rm(localPath, { force: true });
  logger.info('source fetched', { jobId, shotId, key, bytes: body.length });
  return file;
}

// Literal private/loopback/link-local addresses (incl. the cloud metadata
// endpoint) and localhost. Hostnames that resolve to one are still caught by
// the content-type check: nothing there serves image/* or video/*.
export function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  const v = isIP(h);
  if (v === 4) {
    const [a, b] = h.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (v === 6) {
    return (
      h === '::1' ||
      h === '::' ||
      h.startsWith('fc') ||
      h.startsWith('fd') ||
      h.startsWith('fe80') ||
      h.startsWith('::ffff:')
    );
  }
  return false;
}
