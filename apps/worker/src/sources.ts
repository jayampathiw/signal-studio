import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';

import type { ManifestT, ShotHighlightT, ShotT } from '@signal-studio/core/schemas';
import { NonRetryableError } from '@signal-studio/core/state';
import type { StorageProvider } from '@signal-studio/providers/contracts';

import {
  DocumentError,
  findQuote,
  readPdfPage,
  renderPdfPage,
  toShotHighlights,
} from './documents.ts';
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
    if (shot.source.page !== undefined) {
      if (kind === 'clip') {
        throw new NonRetryableError(
          `run-job: shot "${shot.id}" — a PDF page source can't be used by "${manifest.visual.mode}", which needs video clips`,
        );
      }
      shots.push(await resolveDocument(params, shot));
      continue;
    }
    const file = await resolveUrl(params, shot.id, shot.source.url, kind);
    shots.push({ ...shot, [kind]: file });
  }
  return shots;
}

function urlHash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 12);
}

export function sourceFileName(url: string, kind: Kind): string {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  return `source-${urlHash(url)}${KNOWN_EXT[kind].includes(ext) ? ext : kind === 'clip' ? '.mp4' : '.jpg'}`;
}

type Fetched = { file: string; localPath?: string };

/**
 * Makes sure `jobs/<id>/uploads/<shot>/<file>` holds the URL's bytes: reuses
 * the stored copy when there is one (downloading it only if `keepLocal`),
 * otherwise downloads from the site, checks it with `accept`, and stores it.
 */
async function fetchIntoStorage(
  params: ResolveSourcesParams,
  shotId: string,
  url: string,
  file: string,
  accept: { check: (type: string, body: Buffer) => boolean; expected: string },
  keepLocal: boolean,
): Promise<Fetched> {
  const { jobId, storage, fetchFn, tmpDir, logger } = params;
  const key = `jobs/${jobId}/uploads/${shotId}/${file}`;
  const localPath = path.join(tmpDir, 'sources', shotId, file);
  const fail = (reason: string, retryable = false) => {
    const Err = retryable ? Error : NonRetryableError;
    return new Err(`run-job: shot "${shotId}" source ${url} — ${reason}`);
  };

  const storedUrl = await storage.signedUrl(key);
  const cached = await fetchFn(
    storedUrl,
    keepLocal ? undefined : { headers: { Range: 'bytes=0-0' } },
  ).catch(() => null);
  if (cached?.ok) {
    logger.info('source already fetched', { jobId, shotId, key });
    if (!keepLocal) {
      await cached.body?.cancel();
      return { file };
    }
    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, Buffer.from(await cached.arrayBuffer()));
    return { file, localPath };
  }

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

  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES;
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) {
    await res.body?.cancel();
    throw fail(`larger than ${maxBytes} bytes`);
  }
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > maxBytes) throw fail(`larger than ${maxBytes} bytes`);
  if (body.length === 0) throw fail('empty response');
  if (!accept.check(type, body)) {
    throw fail(`expected ${accept.expected}, got "${type || 'no content-type'}"`);
  }

  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, body);
  await storage.put({ localPath, key });
  logger.info('source fetched', { jobId, shotId, key, bytes: body.length });
  if (keepLocal) return { file, localPath };
  await rm(localPath, { force: true });
  return { file };
}

async function resolveUrl(
  params: ResolveSourcesParams,
  shotId: string,
  url: string,
  kind: Kind,
): Promise<string> {
  const wanted = kind === 'clip' ? 'video/' : 'image/';
  const { file } = await fetchIntoStorage(
    params,
    shotId,
    url,
    sourceFileName(url, kind),
    { check: (type) => type.startsWith(wanted), expected: `${wanted}* for this template` },
    false,
  );
  return file;
}

// Servers often send PDFs as application/octet-stream, so the bytes decide.
const PDF_ACCEPT = {
  check: (_type: string, body: Buffer) => body.subarray(0, 1024).includes('%PDF-'),
  expected: 'a PDF',
};

async function resolveDocument(params: ResolveSourcesParams, shot: ShotT): Promise<ShotT> {
  const { url, page, highlight } = shot.source!;
  const pdf = await fetchIntoStorage(
    params,
    shot.id,
    url,
    `source-${urlHash(url)}.pdf`,
    PDF_ACCEPT,
    true,
  );
  const fail = (err: unknown) => {
    if (!(err instanceof DocumentError)) return err;
    return new NonRetryableError(
      `run-job: shot "${shot.id}" source ${url} page ${page} — ${err.message}`,
    );
  };

  const pngFile = `source-${urlHash(`${url}#page=${page}`)}.png`;
  let pdfPage;
  try {
    pdfPage = await readPdfPage(pdf.localPath!, page!);
    const prefix = path.join(params.tmpDir, 'sources', shot.id, pngFile.replace(/\.png$/, ''));
    const pngPath = await renderPdfPage(pdf.localPath!, page!, prefix);
    await params.storage.put({
      localPath: pngPath,
      key: `jobs/${params.jobId}/uploads/${shot.id}/${pngFile}`,
    });
  } catch (err) {
    throw fail(err);
  }

  const handEntered = shot.highlight !== undefined || shot.highlights !== undefined;
  if (!highlight || handEntered) return { ...shot, image: pngFile };

  const highlights: ShotHighlightT[] = [];
  for (const spec of highlight) {
    try {
      highlights.push(...toShotHighlights(pdfPage, findQuote(pdfPage, spec), spec));
    } catch (err) {
      throw fail(err);
    }
  }
  params.logger.info('document highlights placed', {
    jobId: params.jobId,
    shotId: shot.id,
    boxes: highlights.length,
  });
  return { ...shot, image: pngFile, highlights };
}

// Literal private/loopback/link-local addresses (incl. the cloud metadata
// endpoint) and localhost. Hostnames that resolve to one are still caught by
// the content checks: nothing there serves image/*, video/* or a PDF.
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
