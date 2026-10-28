import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Manifest } from '@signal-studio/core/schemas';
import { NonRetryableError } from '@signal-studio/core/state';

import { createLogger } from './logger.ts';
import { isBlockedHost, resolveShotSources, sourceFileName } from './sources.ts';

const logger = createLogger({ level: 'error' });

function caseFileManifest(shots: unknown[]) {
  return Manifest.parse({
    version: '1',
    projectRef: 'p',
    template: 'case-file',
    visual: { mode: 'case-file' },
    shots,
    case_file: { caseId: 'c' },
    outputs: ['fb'],
    captions: {},
  });
}

function fakeStorage() {
  const stored = new Set<string>();
  return {
    stored,
    storage: {
      async signedUrl(key: string) {
        return `https://r2.test/${key}`;
      },
      async put({ key }: { localPath: string; key: string }) {
        stored.add(key);
        return { url: `https://r2.test/${key}` };
      },
      async presignUpload(key: string) {
        return `https://r2.test/${key}`;
      },
    },
  };
}

// R2 answers from `stored`; every other URL from `site`.
function fakeFetch(stored: Set<string>, site: (url: string) => Response) {
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    if (url.startsWith('https://r2.test/')) {
      return new Response(stored.has(url.slice('https://r2.test/'.length)) ? 'x' : null, {
        status: stored.has(url.slice('https://r2.test/'.length)) ? 206 : 404,
      });
    }
    return site(url);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sources-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const PNG = () => new Response('png-bytes', { headers: { 'content-type': 'image/png' } });

test('a url source is downloaded, stored under the job uploads, and becomes shot.image', () =>
  withTmp(async (tmpDir) => {
    const { storage, stored } = fakeStorage();
    const { fn } = fakeFetch(stored, PNG);
    const manifest = caseFileManifest([
      { id: 's1', source: { url: 'https://example.com/a/page.png?x=1' } },
      { id: 's2', image: 'uploaded.jpg' },
    ]);

    const shots = await resolveShotSources({
      jobId: 'j1',
      manifest,
      storage,
      fetchFn: fn,
      tmpDir,
      logger,
    });

    const file = sourceFileName('https://example.com/a/page.png?x=1', 'image');
    assert.match(file, /^source-[0-9a-f]{12}\.png$/);
    assert.equal(shots[0]!.image, file);
    assert.equal(shots[1]!.image, 'uploaded.jpg');
    assert.deepEqual([...stored], [`jobs/j1/uploads/s1/${file}`]);
  }));

test('a retry reuses the stored copy and never hits the source site again', () =>
  withTmp(async (tmpDir) => {
    const { storage, stored } = fakeStorage();
    const url = 'https://example.com/page.png';
    stored.add(`jobs/j1/uploads/s1/${sourceFileName(url, 'image')}`);
    const { fn, calls } = fakeFetch(stored, () => {
      throw new Error('source site must not be called');
    });

    const manifest = caseFileManifest([{ id: 's1', source: { url } }]);
    await resolveShotSources({ jobId: 'j1', manifest, storage, fetchFn: fn, tmpDir, logger });
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.startsWith('https://r2.test/'));
  }));

test('a manifest with no sources is returned untouched, with no fetches', async () => {
  const { storage, stored } = fakeStorage();
  const { fn, calls } = fakeFetch(stored, PNG);
  const manifest = caseFileManifest([{ id: 's1', image: 'a.jpg' }]);
  const shots = await resolveShotSources({
    jobId: 'j1',
    manifest,
    storage,
    fetchFn: fn,
    tmpDir: os.tmpdir(),
    logger,
  });
  assert.equal(shots, manifest.shots);
  assert.equal(calls.length, 0);
});

test('clips-overlay sources become clips and must be video', () =>
  withTmp(async (tmpDir) => {
    const { storage, stored } = fakeStorage();
    const manifest = Manifest.parse({
      version: '1',
      projectRef: 'p',
      template: 'clips-overlay',
      visual: { mode: 'clips-overlay' },
      shots: [{ id: 's1', source: { url: 'https://cdn.test/v' }, overlay_out_s: 2 }],
      end_card: { subject: 'x', disclosure: 'AI' },
      outputs: ['fb'],
      captions: {},
    });

    const ok = fakeFetch(
      stored,
      () => new Response('mp4', { headers: { 'content-type': 'video/mp4' } }),
    );
    const shots = await resolveShotSources({
      jobId: 'j1',
      manifest,
      storage,
      fetchFn: ok.fn,
      tmpDir,
      logger,
    });
    assert.match(shots[0]!.clip!, /^source-[0-9a-f]{12}\.mp4$/);

    stored.clear();
    const wrong = fakeFetch(stored, PNG);
    await assert.rejects(
      resolveShotSources({ jobId: 'j1', manifest, storage, fetchFn: wrong.fn, tmpDir, logger }),
      (err: Error) => err instanceof NonRetryableError && /expected video\/\*/.test(err.message),
    );
  }));

test('failures name the shot and URL; 4xx is final, 5xx is retryable', () =>
  withTmp(async (tmpDir) => {
    const { storage, stored } = fakeStorage();
    const manifest = caseFileManifest([{ id: 's7', source: { url: 'https://example.com/x.png' } }]);
    const run = (status: number) =>
      resolveShotSources({
        jobId: 'j1',
        manifest,
        storage,
        fetchFn: fakeFetch(stored, () => new Response(null, { status })).fn,
        tmpDir,
        logger,
      });

    await assert.rejects(run(404), (err: Error) => {
      assert.ok(err instanceof NonRetryableError);
      assert.match(err.message, /shot "s7" source https:\/\/example\.com\/x\.png — .*HTTP 404/);
      return true;
    });
    await assert.rejects(run(503), (err: Error) => !(err instanceof NonRetryableError));
  }));

test('a non-image response (e.g. an HTML error page) is refused', () =>
  withTmp(async (tmpDir) => {
    const { storage, stored } = fakeStorage();
    const manifest = caseFileManifest([{ id: 's1', source: { url: 'https://example.com/x.png' } }]);
    const html = fakeFetch(
      stored,
      () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    );
    await assert.rejects(
      resolveShotSources({ jobId: 'j1', manifest, storage, fetchFn: html.fn, tmpDir, logger }),
      /expected image\/\* .*got "text\/html"/,
    );
    assert.equal(stored.size, 0);
  }));

test('oversized downloads are refused', () =>
  withTmp(async (tmpDir) => {
    const { storage, stored } = fakeStorage();
    const manifest = caseFileManifest([{ id: 's1', source: { url: 'https://example.com/x.png' } }]);
    await assert.rejects(
      resolveShotSources({
        jobId: 'j1',
        manifest,
        storage,
        fetchFn: fakeFetch(stored, PNG).fn,
        tmpDir,
        logger,
        maxBytes: 3,
      }),
      /larger than 3 bytes/,
    );
  }));

test('private, loopback and metadata addresses are refused before any request', () =>
  withTmp(async (tmpDir) => {
    const { storage, stored } = fakeStorage();
    const { fn, calls } = fakeFetch(stored, PNG);
    const manifest = caseFileManifest([
      { id: 's1', source: { url: 'http://169.254.169.254/computeMetadata/v1/' } },
    ]);
    await assert.rejects(
      resolveShotSources({ jobId: 'j1', manifest, storage, fetchFn: fn, tmpDir, logger }),
      /private or local addresses/,
    );
    assert.ok(calls.every((u) => u.startsWith('https://r2.test/')));

    for (const h of [
      'localhost',
      '127.0.0.1',
      '10.1.2.3',
      '192.168.0.1',
      '172.20.0.1',
      '::1',
      'fd00::1',
      'metadata.google.internal',
    ]) {
      assert.equal(isBlockedHost(h), true, h);
    }
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
      assert.equal(isBlockedHost(h), false, h);
    }
  }));

test('manifest: source cannot be combined with an uploaded image/clip, and must be http(s)', () => {
  assert.throws(
    () =>
      caseFileManifest([
        { id: 's1', image: 'a.jpg', source: { url: 'https://example.com/a.png' } },
      ]),
    /either source or an uploaded image\/clip/,
  );
  assert.throws(
    () => caseFileManifest([{ id: 's1', source: { url: 'ftp://example.com/a.png' } }]),
    /http\(s\)/,
  );
  assert.throws(() =>
    caseFileManifest([{ id: 's1', source: { url: 'https://x.test/a', page: 2 } }]),
  );
});
