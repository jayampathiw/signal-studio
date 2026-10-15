import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Manifest } from '@signal-studio/core/schemas';

import { createLogger } from './logger.ts';
import { resolveMusicBed, type ResolveMusicParams } from './music.ts';

const library = {
  version: 1,
  tracks: [
    {
      id: 'tension-01',
      file: 'tension-01.mp3',
      source: 'pixabay',
      licence: 'pixabay-content-license',
      moods: ['tension'],
    },
    {
      id: 'hope-01',
      file: 'Hope_01.mp3',
      source: 'pixabay',
      licence: 'pixabay-content-license',
      moods: ['hope'],
    },
  ],
};

function manifest(music: Record<string, unknown> = {}) {
  return Manifest.parse({
    version: '1',
    projectRef: 'test-project',
    template: 'clips-overlay',
    visual: { mode: 'clips-overlay' },
    shots: [
      {
        id: 's1',
        clip: 's1.mp4',
        overlay_text: 'A fact',
        overlay_out_s: 1.5,
        voiceover_text: 'A fact about testing.',
        audio: { strip_native_audio: false, keep_native_sfx: true },
      },
    ],
    end_card: { subject: 'Test subject', disclosure: 'AI visualisation' },
    audio: { voice: 'bm_george', speed: 1, music },
    outputs: ['fb'],
    captions: { facebook: 'FB body', hashtags_facebook: [] },
  });
}

async function setup(
  opts: { files?: Record<string, string | null>; music?: Record<string, unknown> } = {},
) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'music-test-'));
  const files: Record<string, string | null> = {
    'music/library.json': JSON.stringify(library),
    'music/tension-01.mp3': 'tension-bytes',
    'music/hope-01.mp3': 'hope-bytes',
    ...opts.files,
  };
  const fetched: string[] = [];
  const records: Array<{ kind: string; url: string; meta: Record<string, unknown> }> = [];
  const params: ResolveMusicParams = {
    jobId: 'job-1',
    manifest: manifest(opts.music),
    platforms: ['facebook'],
    allowedIds: [],
    storage: { signedUrl: async (key: string) => `https://r2.test/${key}` } as never,
    fetchFn: (async (url: string) => {
      const key = url.replace('https://r2.test/', '');
      fetched.push(key);
      const body = files[key];
      return body == null
        ? new Response('missing', { status: 404 })
        : new Response(body, { status: 200 });
    }) as never,
    tmpDir,
    artifactsRepo: {
      async record(
        _job: string,
        _stage: string,
        kind: string,
        url: string,
        meta: Record<string, unknown> = {},
      ) {
        records.push({ kind, url, meta });
        return {} as never;
      },
    },
    logger: createLogger({ level: 'error' }),
  };
  return { params, fetched, records, cleanup: () => rm(tmpDir, { recursive: true, force: true }) };
}

test('resolveMusicBed: auto mode picks by mood, downloads the track, records which one', async () => {
  const t = await setup({ music: { mood: 'hope' } });
  try {
    const r = await resolveMusicBed(t.params);
    assert.equal(r?.track?.id, 'hope-01');
    assert.equal(await readFile(r!.path, 'utf8'), 'hope-bytes');
    assert.deepEqual(t.fetched, ['music/library.json', 'music/hope-01.mp3']);
    assert.equal(t.records[0].kind, 'music-bed');
    assert.equal(t.records[0].meta.trackId, 'hope-01');
    assert.equal(t.records[0].meta.moodMatched, true);
  } finally {
    await t.cleanup();
  }
});

test('resolveMusicBed: none and in-app modes render without music and fetch nothing', async () => {
  for (const mode of ['none', 'in-app']) {
    const t = await setup({ music: { mode } });
    try {
      assert.equal(await resolveMusicBed(t.params), undefined);
      assert.deepEqual(t.fetched, []);
    } finally {
      await t.cleanup();
    }
  }
});

test('resolveMusicBed: file names a library track id; an http(s) URL passes straight through', async () => {
  const t = await setup({ music: { file: 'tension-01' } });
  try {
    const r = await resolveMusicBed(t.params);
    assert.equal(r?.track?.id, 'tension-01');
    assert.equal(t.records[0].meta.requested, true);
  } finally {
    await t.cleanup();
  }
  const u = await setup({ music: { file: 'https://cdn.test/bed.mp3' } });
  try {
    assert.deepEqual(await resolveMusicBed(u.params), { path: 'https://cdn.test/bed.mp3' });
    assert.deepEqual(u.fetched, []);
  } finally {
    await u.cleanup();
  }
});

test('resolveMusicBed: never throws — missing index, bad index, unknown id, failed download', async () => {
  const cases: Array<Parameters<typeof setup>[0]> = [
    { files: { 'music/library.json': null } },
    { files: { 'music/library.json': 'not json' } },
    { files: { 'music/library.json': JSON.stringify({ version: 2, tracks: [] }) } },
    { music: { file: 'no-such-track' } },
    { music: { mood: 'tension' }, files: { 'music/tension-01.mp3': null } },
  ];
  for (const c of cases) {
    const t = await setup(c);
    try {
      assert.equal(await resolveMusicBed(t.params), undefined);
      assert.equal(t.records.length, 0);
    } finally {
      await t.cleanup();
    }
  }
});
