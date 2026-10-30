import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { Manifest } from '@signal-studio/core/schemas';
import { compile as compileCarousel } from '@signal-studio/template-carousel/compile';
import { compile as compileCaseFile } from '@signal-studio/template-case-file/compile';
import { compile as compileClipsOverlay } from '@signal-studio/template-clips-overlay/compile';
import { compile as compileCompilation } from '@signal-studio/template-compilation/compile';
import { compile as compileShorts916 } from '@signal-studio/template-shorts-916/compile';
import { compile as compileStillsKenburns } from '@signal-studio/template-stills-kenburns/compile';
import { parseShotlistText as parseShotlistV2 } from '@signal-studio/template-stills-kenburns/parsers/parse-shotlist-v2';

import { runJob, type RunJobDeps } from './run-job.ts';
import { createLogger } from '../logger.ts';

const execFileAsync = promisify(execFile);

async function makeSyntheticClip(outFile: string, durationS = 2): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=640x480:rate=24:duration=${durationS}`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationS}`,
    '-shortest',
    outFile,
  ]);
}

function baseManifest(overrides: Record<string, unknown> = {}) {
  return {
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
    audio: { voice: 'bm_george', speed: 1 },
    outputs: ['fb'],
    gates: [],
    publish: [],
    captions: { facebook: 'FB body', hashtags_facebook: [] },
    ...overrides,
  };
}

const baseProject = {
  slug: 'test-project',
  orgId: 'org-test',
  defaults: { template: 'clips-overlay', voice: 'bm_george', speed: 1, outputs: ['fb'] },
  gates: [],
  publishTargets: [{ platform: 'facebook', credentialRef: 'TEST' }],
  providers: {
    tts: 'kokoro-js',
    captions: 'whisper',
    image: 'fal',
    storage: 'local',
    publish: 'facebook',
  },
  qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
};

type FakeDeps = RunJobDeps & {
  statusUpdates: string[];
  failures: Array<{ stage: string; error: string; retryable: boolean }>;
  artifacts: Array<{ kind: string; url: string }>;
  publishCalls: Array<{
    platform: string;
    pageRef: string;
    video: string;
    caption: string;
    scheduleAt?: string;
  }>;
};

function fakeDeps(clipPath: string, manifestOverrides: Record<string, unknown> = {}): FakeDeps {
  const statusUpdates: string[] = [];
  const failures: Array<{ stage: string; error: string; retryable: boolean }> = [];
  const artifacts: Array<{ kind: string; url: string }> = [];
  const publishCalls: FakeDeps['publishCalls'] = [];
  const stageStore = new Map<
    string,
    { hash: string; status: 'done' | 'failed'; outputs?: unknown }
  >();
  const qaMeasurements = new Map<
    string,
    {
      durationSec: number;
      width: number;
      height: number;
      fps: number;
      integratedLufs: number;
      truePeakDb: number;
    }
  >();

  return {
    jobsRepo: {
      async getById() {
        return {
          id: 'job-1',
          org_id: 'org-test',
          project_id: 'proj-1',
          manifest: Manifest.parse(baseManifest(manifestOverrides)),
          status: 'created',
          created_at: '',
          updated_at: '',
        };
      },
      async updateStatus(_id: string, status: string) {
        statusUpdates.push(status);
      },
      async markFailed(_id: string, failure: { stage: string; error: string; retryable: boolean }) {
        statusUpdates.push('failed');
        failures.push(failure);
      },
    } as never,
    projectsRepo: {
      async getById() {
        return { id: 'proj-1', org_id: 'org-test', slug: 'test-project', config: baseProject };
      },
    } as never,
    createArtifactsRepo: () =>
      ({
        async record(_jobId: string, _stage: string, kind: string, url: string) {
          artifacts.push({ kind, url });
        },
      }) as never,
    createStageStore: () =>
      ({
        async getLastRun(_jobId: string, stageName: string, outputId?: string) {
          return stageStore.get(`${stageName}:${outputId ?? ''}`) ?? null;
        },
        async recordStart() {},
        async recordEnd(_jobId: string, stageName: string, result: never, outputId?: string) {
          stageStore.set(`${stageName}:${outputId ?? ''}`, result);
        },
        async log() {},
      }) as never,
    createStorage: () =>
      ({
        async signedUrl(key: string) {
          return `https://fake-storage.test/${key}`;
        },
        async put({ localPath, key }: { localPath: string; key: string }) {
          void localPath;
          return { url: `https://fake-storage.test/${key}` };
        },
        async presignUpload(key: string) {
          return `https://fake-storage.test/${key}`;
        },
      }) as never,
    synthesise: async ({ text }: { text: string }) => {
      void text;
      const wavPath = path.join(os.tmpdir(), `fake-vo-${Date.now()}.wav`);
      await writeFile(wavPath, 'fake-wav-bytes');
      return { wavPath, durationSec: 1.8 };
    },
    compileClipsOverlay,
    compileCaseFile: () => {
      throw new Error('compileCaseFile: not exercised by these clips-overlay tests');
    },
    compileStillsKenburns: () => {
      throw new Error('compileStillsKenburns: not exercised by these clips-overlay tests');
    },
    compileShorts916: () => {
      throw new Error('compileShorts916: not exercised by these clips-overlay tests');
    },
    compileCompilation: () => {
      throw new Error('compileCompilation: not exercised by these clips-overlay tests');
    },
    compileCarousel: () => {
      throw new Error('compileCarousel: not exercised by these clips-overlay tests');
    },
    renderCarouselStills: () => {
      throw new Error('renderCarouselStills: not exercised by these clips-overlay tests');
    },
    createCarouselPublishProviderFor: () => {
      throw new Error(
        'createCarouselPublishProviderFor: not exercised by these clips-overlay tests',
      );
    },
    parseShotlistV2: () => {
      throw new Error('parseShotlistV2: not exercised by these clips-overlay tests');
    },
    render: async (timeline, opts) => {
      await mkdir(opts.outputDir, { recursive: true });
      const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
      await writeFile(outputPath, 'fake-mp4-bytes');
      // Fed to the fake `measureVideo`/`detectBlackFrames` below, keyed by
      // this exact path — the fake render's own `timeline` is the only
      // place that knows what a real ffprobe measurement of its (fake)
      // output "should" say, since nothing here actually renders pixels.
      qaMeasurements.set(outputPath, {
        durationSec:
          timeline.scenes.reduce((sum, s) => sum + s.durationSecs, 0) +
          (timeline.cta?.durationSecs ?? 0),
        width: 1080,
        height: 1920,
        fps: 30,
        integratedLufs: -14,
        truePeakDb: -3,
      });
      return outputPath;
    },
    createPublishProviderFor: (platform: string) =>
      ({
        async post(args: { pageRef: string; video: string; caption: string }) {
          publishCalls.push({ platform, ...args });
          return { postId: 'p1', url: 'https://facebook.com/p1' };
        },
      }) as never,
    measureVideo: async (localPath: string) => {
      const m = qaMeasurements.get(localPath);
      if (!m) throw new Error(`no fake qa measurement recorded for ${localPath}`);
      return m;
    },
    detectBlackFrames: async () => [],
    fetchFn: (async () => {
      const bytes = await readFile(clipPath);
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch,
    statusUpdates,
    failures,
    artifacts,
    publishCalls,
  };
}

test('runJob: publishes to facebook and delivers when publish[] is set and there are no gates', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-test-'));
  try {
    const clipPath = path.join(workDir, 's1.mp4');
    await makeSyntheticClip(clipPath);

    const deps = fakeDeps(clipPath, { publish: ['facebook'] });

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(deps.statusUpdates, ['queued', 'dispatched', 'running', 'delivered']);
    assert.equal(deps.publishCalls.length, 1);
    assert.equal(deps.publishCalls[0].platform, 'facebook');
    assert.equal(deps.publishCalls[0].pageRef, 'TEST');
    // Manifest.parse() defaults `disclosure: true`, so the publish stage's
    // buildCaption() correctly appends end_card.disclosure — this is real
    // caption-building behavior, not a test fixture bug.
    assert.equal(deps.publishCalls[0].caption, 'FB body\n\nAI visualisation');
    assert.ok(deps.publishCalls[0].video.includes('rendered/fb.mp4'));

    const publishArtifact = deps.artifacts.find((a) => a.kind === 'post');
    assert.ok(publishArtifact, 'expected a publish artifact to be recorded');
    assert.equal(publishArtifact?.url, 'https://facebook.com/p1');
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: does not publish when the job has gates, even if publish[] is set', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-test-'));
  try {
    const clipPath = path.join(workDir, 's1.mp4');
    await makeSyntheticClip(clipPath);

    const deps = fakeDeps(clipPath, { publish: ['facebook'], gates: ['image-quality'] });

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(deps.statusUpdates, [
      'queued',
      'dispatched',
      'running',
      'awaiting_review:image-quality',
    ]);
    assert.equal(deps.publishCalls.length, 0);
    assert.equal(
      deps.artifacts.find((a) => a.kind === 'post'),
      undefined,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: skips publish entirely when publish[] is empty', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-test-'));
  try {
    const clipPath = path.join(workDir, 's1.mp4');
    await makeSyntheticClip(clipPath);

    const deps = fakeDeps(clipPath);

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(deps.statusUpdates, ['queued', 'dispatched', 'running', 'delivered']);
    assert.equal(deps.publishCalls.length, 0);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: a qa stage failure marks the job failed and blocks publish', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-test-'));
  try {
    const clipPath = path.join(workDir, 's1.mp4');
    await makeSyntheticClip(clipPath);

    const deps = fakeDeps(clipPath, { publish: ['facebook'] });
    // Real render duration is correct; simulate a real render/measurement
    // mismatch (e.g. a truncated file) by reporting a wildly wrong duration.
    deps.measureVideo = async () => ({
      durationSec: 0.1,
      width: 1080,
      height: 1920,
      fps: 30,
      integratedLufs: -14,
      truePeakDb: -3,
    });

    await assert.rejects(
      () => runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' })),
      /qa stage failed.*duration/,
    );

    assert.deepEqual(deps.statusUpdates, ['queued', 'dispatched', 'running', 'failed']);
    assert.equal(deps.publishCalls.length, 0);
    assert.equal(deps.failures.length, 1);
    assert.equal(deps.failures[0].stage, 'qa');
    assert.equal(deps.failures[0].retryable, false);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: case-file handler compiles, renders, and delivers using the real compileCaseFile(), fetching a source.url shot', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-case-file-test-'));
  try {
    const imagePath = path.join(workDir, 'doc1.png');
    await writeFile(imagePath, 'fake-image-bytes');

    const manifest = Manifest.parse({
      version: '1',
      projectRef: 'test-project',
      template: 'case-file',
      visual: { mode: 'case-file' },
      shots: [
        {
          id: 's1',
          image: 'doc1.png',
          voiceover_text: 'This is a real narration line for the case file.',
          text: 'Fallback caption text.',
        },
        {
          id: 's3',
          source: { url: 'https://example.com/docs/ruling-page.png' },
          voiceover_text: 'A page fetched from a link, not uploaded.',
        },
        {
          id: 's2',
          durationSecs: 4.5,
          visual: { kind: 'counter', value: 180, suffix: ' DAYS', label: 'TO FILE AN APPEAL' },
        },
      ],
      case_file: { caseId: 'test-case', aspectRatio: '16:9' },
      outputs: ['fb'],
      gates: [],
      publish: [],
      captions: {},
      audio: { voice: 'bm_george', speed: 1 },
    });

    const qaMeasurements = new Map<
      string,
      {
        durationSec: number;
        width: number;
        height: number;
        fps: number;
        integratedLufs: number;
        truePeakDb: number;
      }
    >();
    const statusUpdates: string[] = [];
    const failures: Array<{ stage: string; error: string; retryable: boolean }> = [];
    const renderedTimelines: Array<{ scenes: Array<Record<string, unknown>> }> = [];
    const storedKeys = new Set<string>();
    let sourceFetches = 0;
    const transcribed: string[] = [];
    const stageStore = new Map<
      string,
      { hash: string; status: 'done' | 'failed'; outputs?: unknown }
    >();

    const deps: RunJobDeps = {
      jobsRepo: {
        async getById() {
          return {
            id: 'job-1',
            org_id: 'org-test',
            project_id: 'proj-1',
            manifest,
            status: 'created',
            created_at: '',
            updated_at: '',
          };
        },
        async updateStatus(_id: string, status: string) {
          statusUpdates.push(status);
        },
        async markFailed(
          _id: string,
          failure: { stage: string; error: string; retryable: boolean },
        ) {
          statusUpdates.push('failed');
          failures.push(failure);
        },
      } as never,
      projectsRepo: {
        async getById() {
          return {
            id: 'proj-1',
            org_id: 'org-test',
            slug: 'test-project',
            config: {
              slug: 'test-project',
              orgId: 'org-test',
              defaults: { template: 'case-file', voice: 'bm_george', speed: 1, outputs: ['fb'] },
              gates: [],
              publishTargets: [],
              providers: {
                tts: 'kokoro-js',
                captions: 'whisper',
                image: 'fal',
                storage: 'local',
                publish: 'facebook',
              },
              qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
            },
          };
        },
      } as never,
      createArtifactsRepo: () => ({ async record() {} }) as never,
      createStageStore: () =>
        ({
          async getLastRun(_jobId: string, stageName: string, outputId?: string) {
            return stageStore.get(`${stageName}:${outputId ?? ''}`) ?? null;
          },
          async recordStart() {},
          async recordEnd(_jobId: string, stageName: string, result: never, outputId?: string) {
            stageStore.set(`${stageName}:${outputId ?? ''}`, result);
          },
          async log() {},
        }) as never,
      createStorage: () =>
        ({
          async signedUrl(key: string) {
            return `https://fake-storage.test/${key}`;
          },
          async put({ key }: { localPath: string; key: string }) {
            storedKeys.add(key);
            return { url: `https://fake-storage.test/${key}` };
          },
          async presignUpload(key: string) {
            return `https://fake-storage.test/${key}`;
          },
        }) as never,
      synthesise: async ({ text }: { text: string }) => {
        void text;
        const wavPath = path.join(os.tmpdir(), `fake-vo-${Date.now()}.wav`);
        await writeFile(wavPath, 'fake-wav-bytes');
        return { wavPath, durationSec: 3.0 };
      },
      wordTimings: async ({ wavPath, hintText }) => {
        transcribed.push(path.basename(wavPath));
        if (wavPath.endsWith('s3.wav')) throw new Error('whisper crashed');
        assert.equal(hintText, 'This is a real narration line for the case file.');
        return [
          { text: 'This', start: 0.1, end: 0.3 },
          { text: 'is', start: 0.3, end: 0.4 },
        ];
      },
      compileClipsOverlay: () => {
        throw new Error('compileClipsOverlay: not exercised by this case-file test');
      },
      compileCaseFile,
      compileStillsKenburns: () => {
        throw new Error('compileStillsKenburns: not exercised by this case-file test');
      },
      compileShorts916: () => {
        throw new Error('compileShorts916: not exercised by this case-file test');
      },
      compileCompilation: () => {
        throw new Error('compileCompilation: not exercised by this case-file test');
      },
      compileCarousel: () => {
        throw new Error('compileCarousel: not exercised by this case-file test');
      },
      renderCarouselStills: () => {
        throw new Error('renderCarouselStills: not exercised by this case-file test');
      },
      createCarouselPublishProviderFor: () => {
        throw new Error('createCarouselPublishProviderFor: not exercised by this case-file test');
      },
      parseShotlistV2: () => {
        throw new Error('parseShotlistV2: not exercised by this case-file test');
      },
      render: async (timeline, opts) => {
        await mkdir(opts.outputDir, { recursive: true });
        const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
        await writeFile(outputPath, 'fake-mp4-bytes');
        renderedTimelines.push(timeline as never);
        qaMeasurements.set(outputPath, {
          // case-file's real CaseFile.tsx adds a fixed 2.5s outro card
          // whenever caseMeta.showOutro is set (the default) — matches
          // run-job.ts's own real "expected duration" fix for the same gap.
          durationSec:
            timeline.scenes.reduce((sum, s) => sum + s.durationSecs, 0) +
            (timeline.caseMeta?.showOutro !== false ? 2.5 : 0),
          width: 1920,
          height: 1080,
          fps: 30,
          integratedLufs: -14,
          truePeakDb: -3,
        });
        return outputPath;
      },
      createPublishProviderFor: () =>
        ({
          async post() {
            return { postId: 'x' };
          },
        }) as never,
      measureVideo: async (localPath: string) => {
        const m = qaMeasurements.get(localPath);
        if (!m) throw new Error(`no fake qa measurement recorded for ${localPath}`);
        return m;
      },
      detectBlackFrames: async () => [],
      fetchFn: (async (url: string) => {
        const bytes = await readFile(imagePath);
        if (url === 'https://example.com/docs/ruling-page.png') {
          sourceFetches++;
          return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } });
        }
        const key = new URL(url).pathname.replace(/^\//, '');
        if (key.includes('/source-') && !storedKeys.has(key)) {
          return new Response(null, { status: 404 });
        }
        return new Response(bytes, { status: 200 });
      }) as unknown as typeof fetch,
    };

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(statusUpdates, ['queued', 'dispatched', 'running', 'delivered']);
    // Track P (P.2): the `source.url` shot was fetched once, stored under the
    // job's uploads, and rendered from that local copy like an upload.
    assert.equal(sourceFetches, 1);
    const [sourceKey] = [...storedKeys].filter((k) => k.includes('/source-'));
    assert.match(sourceKey!, /^jobs\/job-1\/uploads\/s3\/source-[0-9a-f]{12}\.png$/);
    const sourcedScene = renderedTimelines[0]!.scenes[1]! as {
      source?: { localPath: string };
    };
    assert.ok(sourcedScene.source?.localPath.endsWith(path.basename(sourceKey!)));
    // On-video captions: Whisper's words for s1; s3's transcription failed,
    // so its narration is spread evenly over its 3s of audio instead.
    assert.deepEqual(transcribed, ['s1.wav', 's3.wav']);
    const [s1Scene, s3Scene] = renderedTimelines[0]!.scenes as Array<{
      captionText?: string;
      words?: Array<{ text: string; start: number; end: number }>;
    }>;
    assert.equal(s1Scene!.captionText, 'This is');
    assert.equal(s1Scene!.words![1]!.start, 0.3);
    assert.equal(s3Scene!.captionText, 'A page fetched from a link, not uploaded.');
    assert.equal(s3Scene!.words!.length, 8);
    assert.equal(s3Scene!.words![7]!.end, 3);
    const silentScene = renderedTimelines[0]!.scenes[2]!;
    assert.equal(silentScene.durationSecs, 4.5);
    assert.equal(silentScene.words, undefined);
    assert.deepEqual(silentScene.visual, {
      kind: 'counter',
      value: 180,
      suffix: ' DAYS',
      label: 'TO FILE AN APPEAL',
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: throws a clear error for an unsupported visual.mode', async () => {
  const manifest = Manifest.parse({
    version: '1',
    projectRef: 'test-project',
    template: 'longform-brief',
    visual: { mode: 'longform-brief' },
    shots: [{ id: 's1', text: 'x' }],
    outputs: ['fb'],
    gates: [],
    publish: [],
    captions: {},
  });

  const deps: RunJobDeps = {
    jobsRepo: {
      async getById() {
        return {
          id: 'job-1',
          org_id: 'org-test',
          project_id: 'proj-1',
          manifest,
          status: 'created',
          created_at: '',
          updated_at: '',
        };
      },
      async updateStatus() {},
      async markFailed() {},
    } as never,
    projectsRepo: {
      async getById() {
        return {
          id: 'proj-1',
          org_id: 'org-test',
          slug: 'test-project',
          config: {
            slug: 'test-project',
            orgId: 'org-test',
            defaults: {
              template: 'longform-brief',
              voice: 'bm_george',
              speed: 1,
              outputs: ['fb'],
            },
            gates: [],
            publishTargets: [],
            providers: {
              tts: 'kokoro-js',
              captions: 'whisper',
              image: 'fal',
              storage: 'local',
              publish: 'facebook',
            },
            qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
          },
        };
      },
    } as never,
    createArtifactsRepo: () => ({ async record() {} }) as never,
    createStageStore: () => ({}) as never,
    createStorage: () => ({}) as never,
    synthesise: async () => ({ wavPath: '', durationSec: 0 }),
    compileClipsOverlay: () => {
      throw new Error('unreachable');
    },
    compileCaseFile: () => {
      throw new Error('unreachable');
    },
    compileStillsKenburns: () => {
      throw new Error('unreachable');
    },
    compileShorts916: () => {
      throw new Error('unreachable');
    },
    compileCompilation: () => {
      throw new Error('unreachable');
    },
    compileCarousel: () => {
      throw new Error('compileCarousel: not exercised by this test');
    },
    renderCarouselStills: () => {
      throw new Error('renderCarouselStills: not exercised by this test');
    },
    createCarouselPublishProviderFor: () => {
      throw new Error('createCarouselPublishProviderFor: not exercised by this test');
    },
    parseShotlistV2: () => {
      throw new Error('unreachable');
    },
    render: async () => '',
    createPublishProviderFor: () =>
      ({
        async post() {
          return { postId: 'x' };
        },
      }) as never,
    measureVideo: async () => {
      throw new Error('unreachable');
    },
    detectBlackFrames: async () => [],
  };

  await assert.rejects(
    () => runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' })),
    /unsupported visual\.mode "longform-brief"/,
  );
});

test('runJob: stills-kenburns handler compiles, renders (real render-ffmpeg), and delivers using the real compileStillsKenburns()', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-stills-kenburns-test-'));
  try {
    // Real, minimal shotlist-v2 text (the same shape parse-shotlist-v2.test.ts's
    // own SAMPLE uses) — 2 scenes, each with real stills + narration.
    const shotlistText = `**TITLE:** Test Documentary
**TARGET_DURATION_SEC:** 20

## COLD OPEN

**SCENE 1 — 0:00–0:06 (6s)**
🖼️ STILL A: A goalkeeper alone under stadium lights [WIDE]
🎞️ PUSH
🎙️ "Imagine you are twenty-six years old."

**SCENE 2 — 0:06–0:21 (15s)** · WARM
🖼️ STILL A: Close on his hands
🖼️ STILL B: Wide shot of the pitch
🎞️ A: PUSH B: micro-PUSH
🎙️ "He was the best in the world, briefly."
`;

    const stillA1 = path.join(workDir, 's1a.jpg');
    const stillA2 = path.join(workDir, 's2a.jpg');
    const stillB2 = path.join(workDir, 's2b.jpg');
    await writeFile(stillA1, 'fake-image-bytes');
    await writeFile(stillA2, 'fake-image-bytes');
    await writeFile(stillB2, 'fake-image-bytes');

    const manifest = Manifest.parse({
      version: '1',
      projectRef: 'test-project',
      template: 'stills-kenburns',
      visual: { mode: 'stills-kenburns' },
      stillsKenburns: {
        shotlistText,
        aspectRatio: '16:9',
        stillImages: {
          'S01-A': 's1a.jpg',
          'S02-A': 's2a.jpg',
          'S02-B': 's2b.jpg',
        },
      },
      outputs: ['fb'],
      gates: [],
      publish: [],
      captions: {},
      audio: { voice: 'bm_george', speed: 1 },
    });

    const uploadedFiles: Record<string, string> = {
      'jobs/job-1/uploads/S01-A/s1a.jpg': stillA1,
      'jobs/job-1/uploads/S02-A/s2a.jpg': stillA2,
      'jobs/job-1/uploads/S02-B/s2b.jpg': stillB2,
    };

    const qaMeasurements = new Map<
      string,
      {
        durationSec: number;
        width: number;
        height: number;
        fps: number;
        integratedLufs: number;
        truePeakDb: number;
      }
    >();
    const statusUpdates: string[] = [];
    const failures: Array<{ stage: string; error: string; retryable: boolean }> = [];
    const stageStore = new Map<
      string,
      { hash: string; status: 'done' | 'failed'; outputs?: unknown }
    >();

    const deps: RunJobDeps = {
      jobsRepo: {
        async getById() {
          return {
            id: 'job-1',
            org_id: 'org-test',
            project_id: 'proj-1',
            manifest,
            status: 'created',
            created_at: '',
            updated_at: '',
          };
        },
        async updateStatus(_id: string, status: string) {
          statusUpdates.push(status);
        },
        async markFailed(
          _id: string,
          failure: { stage: string; error: string; retryable: boolean },
        ) {
          statusUpdates.push('failed');
          failures.push(failure);
        },
      } as never,
      projectsRepo: {
        async getById() {
          return {
            id: 'proj-1',
            org_id: 'org-test',
            slug: 'test-project',
            config: {
              slug: 'test-project',
              orgId: 'org-test',
              defaults: {
                template: 'stills-kenburns',
                voice: 'bm_george',
                speed: 1,
                outputs: ['fb'],
              },
              gates: [],
              publishTargets: [],
              providers: {
                tts: 'kokoro-js',
                captions: 'whisper',
                image: 'fal',
                storage: 'local',
                publish: 'facebook',
              },
              qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
            },
          };
        },
      } as never,
      createArtifactsRepo: () => ({ async record() {} }) as never,
      createStageStore: () =>
        ({
          async getLastRun(_jobId: string, stageName: string, outputId?: string) {
            return stageStore.get(`${stageName}:${outputId ?? ''}`) ?? null;
          },
          async recordStart() {},
          async recordEnd(_jobId: string, stageName: string, result: never, outputId?: string) {
            stageStore.set(`${stageName}:${outputId ?? ''}`, result);
          },
          async log() {},
        }) as never,
      createStorage: () =>
        ({
          async signedUrl(key: string) {
            return `https://fake-storage.test/${key}`;
          },
          async put({ key }: { localPath: string; key: string }) {
            return { url: `https://fake-storage.test/${key}` };
          },
          async presignUpload(key: string) {
            return `https://fake-storage.test/${key}`;
          },
        }) as never,
      synthesise: async ({ text }: { text: string }) => {
        void text;
        const wavPath = path.join(os.tmpdir(), `fake-vo-${Date.now()}-${Math.random()}.wav`);
        await writeFile(wavPath, 'fake-wav-bytes');
        return { wavPath, durationSec: 3.0 };
      },
      compileClipsOverlay: () => {
        throw new Error('compileClipsOverlay: not exercised by this stills-kenburns test');
      },
      compileCaseFile: () => {
        throw new Error('compileCaseFile: not exercised by this stills-kenburns test');
      },
      compileStillsKenburns,
      compileShorts916: () => {
        throw new Error('compileShorts916: not exercised by this stills-kenburns test');
      },
      compileCompilation: () => {
        throw new Error('compileCompilation: not exercised by this stills-kenburns test');
      },
      compileCarousel: () => {
        throw new Error('compileCarousel: not exercised by this stills-kenburns test');
      },
      renderCarouselStills: () => {
        throw new Error('renderCarouselStills: not exercised by this stills-kenburns test');
      },
      createCarouselPublishProviderFor: () => {
        throw new Error(
          'createCarouselPublishProviderFor: not exercised by this stills-kenburns test',
        );
      },
      parseShotlistV2,
      render: async () => {
        throw new Error('render (remotion): not exercised by this stills-kenburns test');
      },
      renderFfmpeg: async (timeline, opts) => {
        await mkdir(opts.outputDir, { recursive: true });
        const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
        await writeFile(outputPath, 'fake-mp4-bytes');
        qaMeasurements.set(outputPath, {
          durationSec: timeline.scenes.reduce((sum, s) => sum + s.durationSecs, 0),
          width: 1920,
          height: 1080,
          fps: 25,
          integratedLufs: -14,
          truePeakDb: -3,
        });
        return outputPath;
      },
      createPublishProviderFor: () =>
        ({
          async post() {
            return { postId: 'x' };
          },
        }) as never,
      measureVideo: async (localPath: string) => {
        const m = qaMeasurements.get(localPath);
        if (!m) throw new Error(`no fake qa measurement recorded for ${localPath}`);
        return m;
      },
      detectBlackFrames: async () => [],
      fetchFn: (async (url: string) => {
        const key = new URL(url).pathname.replace(/^\//, '');
        const localPath = uploadedFiles[key];
        if (!localPath) return new Response(null, { status: 404 });
        const bytes = await readFile(localPath);
        return new Response(bytes, { status: 200 });
      }) as unknown as typeof fetch,
    };

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(statusUpdates, ['queued', 'dispatched', 'running', 'delivered']);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: shorts-916 handler compiles, renders (real render-ffmpeg), and delivers using the real compileShorts916()', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-shorts-916-test-'));
  try {
    const stillHook = path.join(workDir, 'hook.jpg');
    const stillSilent = path.join(workDir, 'silent.jpg');
    await writeFile(stillHook, 'fake-image-bytes');
    await writeFile(stillSilent, 'fake-image-bytes');

    // Real minimal shorts-916 config shape (matching content/shorts/*.json's
    // own shape) — a hook scene (VO-reconciled), a silent music-only scene,
    // and an end_card_v2 close, exercising every branch of compile() except
    // `vo_parts` (that path calls real ffmpeg pause-concat outside this
    // handler's own compileOutputs — real-verified separately against real
    // Kokoro TTS + a real DB job, not this fast fake-tts unit test).
    const manifest = Manifest.parse({
      version: '1',
      projectRef: 'test-project',
      template: 'shorts-916',
      visual: { mode: 'shorts-916' },
      shorts916: {
        output: 'test.mp4',
        images: { 'S01-A': 'hook.jpg', 'S02-A': 'silent.jpg' },
        scenes: [
          {
            image: 'S01-A',
            motion: 'push',
            vo: 'This is the hook.',
            target_duration_sec: 3,
            hook: { amber_word: 'hook' },
          },
          { image: 'S02-A', motion: 'hold', target_duration_sec: 2 },
          {
            end_card_v2: true,
            title: 'Underdog',
            subtitle: 'More on the channel',
            target_duration_sec: 4,
          },
        ],
      },
      outputs: ['fb'],
      gates: [],
      publish: [],
      captions: {},
      audio: { voice: 'am_adam', speed: 1 },
    });

    const uploadedFiles: Record<string, string> = {
      'jobs/job-1/uploads/S01-A/hook.jpg': stillHook,
      'jobs/job-1/uploads/S02-A/silent.jpg': stillSilent,
    };

    const qaMeasurements = new Map<
      string,
      {
        durationSec: number;
        width: number;
        height: number;
        fps: number;
        integratedLufs: number;
        truePeakDb: number;
      }
    >();
    const statusUpdates: string[] = [];
    const failures: Array<{ stage: string; error: string; retryable: boolean }> = [];
    const stageStore = new Map<
      string,
      { hash: string; status: 'done' | 'failed'; outputs?: unknown }
    >();

    const deps: RunJobDeps = {
      jobsRepo: {
        async getById() {
          return {
            id: 'job-1',
            org_id: 'org-test',
            project_id: 'proj-1',
            manifest,
            status: 'created',
            created_at: '',
            updated_at: '',
          };
        },
        async updateStatus(_id: string, status: string) {
          statusUpdates.push(status);
        },
        async markFailed(
          _id: string,
          failure: { stage: string; error: string; retryable: boolean },
        ) {
          statusUpdates.push('failed');
          failures.push(failure);
        },
      } as never,
      projectsRepo: {
        async getById() {
          return {
            id: 'proj-1',
            org_id: 'org-test',
            slug: 'test-project',
            config: {
              slug: 'test-project',
              orgId: 'org-test',
              defaults: {
                template: 'shorts-916',
                voice: 'am_adam',
                speed: 1,
                outputs: ['fb'],
              },
              gates: [],
              publishTargets: [],
              providers: {
                tts: 'kokoro-js',
                captions: 'whisper',
                image: 'fal',
                storage: 'local',
                publish: 'facebook',
              },
              qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
            },
          };
        },
      } as never,
      createArtifactsRepo: () => ({ async record() {} }) as never,
      createStageStore: () =>
        ({
          async getLastRun(_jobId: string, stageName: string, outputId?: string) {
            return stageStore.get(`${stageName}:${outputId ?? ''}`) ?? null;
          },
          async recordStart() {},
          async recordEnd(_jobId: string, stageName: string, result: never, outputId?: string) {
            stageStore.set(`${stageName}:${outputId ?? ''}`, result);
          },
          async log() {},
        }) as never,
      createStorage: () =>
        ({
          async signedUrl(key: string) {
            return `https://fake-storage.test/${key}`;
          },
          async put({ key }: { localPath: string; key: string }) {
            return { url: `https://fake-storage.test/${key}` };
          },
          async presignUpload(key: string) {
            return `https://fake-storage.test/${key}`;
          },
        }) as never,
      synthesise: async ({ text }: { text: string }) => {
        void text;
        const wavPath = path.join(os.tmpdir(), `fake-vo-${Date.now()}-${Math.random()}.wav`);
        await writeFile(wavPath, 'fake-wav-bytes');
        return { wavPath, durationSec: 2.5 };
      },
      compileClipsOverlay: () => {
        throw new Error('compileClipsOverlay: not exercised by this shorts-916 test');
      },
      compileCaseFile: () => {
        throw new Error('compileCaseFile: not exercised by this shorts-916 test');
      },
      compileStillsKenburns: () => {
        throw new Error('compileStillsKenburns: not exercised by this shorts-916 test');
      },
      compileShorts916,
      compileCompilation: () => {
        throw new Error('compileCompilation: not exercised by this shorts-916 test');
      },
      compileCarousel: () => {
        throw new Error('compileCarousel: not exercised by this shorts-916 test');
      },
      renderCarouselStills: () => {
        throw new Error('renderCarouselStills: not exercised by this shorts-916 test');
      },
      createCarouselPublishProviderFor: () => {
        throw new Error('createCarouselPublishProviderFor: not exercised by this shorts-916 test');
      },
      parseShotlistV2: () => {
        throw new Error('parseShotlistV2: not exercised by this shorts-916 test');
      },
      render: async () => {
        throw new Error('render (remotion): not exercised by this shorts-916 test');
      },
      renderFfmpeg: async (timeline, opts) => {
        await mkdir(opts.outputDir, { recursive: true });
        const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
        await writeFile(outputPath, 'fake-mp4-bytes');
        qaMeasurements.set(outputPath, {
          durationSec: timeline.scenes.reduce((sum, s) => sum + s.durationSecs, 0),
          width: 1080,
          height: 1920,
          fps: 25,
          integratedLufs: -14,
          truePeakDb: -3,
        });
        return outputPath;
      },
      createPublishProviderFor: () =>
        ({
          async post() {
            return { postId: 'x' };
          },
        }) as never,
      measureVideo: async (localPath: string) => {
        const m = qaMeasurements.get(localPath);
        if (!m) throw new Error(`no fake qa measurement recorded for ${localPath}`);
        return m;
      },
      detectBlackFrames: async () => [],
      fetchFn: (async (url: string) => {
        const key = new URL(url).pathname.replace(/^\//, '');
        const localPath = uploadedFiles[key];
        if (!localPath) return new Response(null, { status: 404 });
        const bytes = await readFile(localPath);
        return new Response(bytes, { status: 200 });
      }) as unknown as typeof fetch,
    };

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(statusUpdates, ['queued', 'dispatched', 'running', 'delivered']);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: compilation handler compiles, renders, and delivers using the real compileClipsOverlay()+compileCompilation()', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-compilation-test-'));
  try {
    // 2 episodes, 2 shots each — every shot is a real clips-overlay-shaped
    // shot (clip + overlay_text + overlay_out_s), pooled into one
    // manifest's shots[] and split back into episodes by episodeRef.
    const clipPaths: Record<string, string> = {};
    for (const id of ['s1', 's2', 's3', 's4']) {
      const clipPath = path.join(workDir, `${id}.mp4`);
      await makeSyntheticClip(clipPath);
      clipPaths[id] = clipPath;
    }

    const manifest = Manifest.parse({
      version: '1',
      projectRef: 'test-project',
      template: 'compilation',
      visual: { mode: 'compilation' },
      shots: [
        {
          id: 's1',
          clip: 's1.mp4',
          overlay_text: 'Episode one, shot one',
          overlay_out_s: 1.5,
          episodeRef: 'ep1',
        },
        {
          id: 's2',
          clip: 's2.mp4',
          overlay_text: 'Episode one, shot two',
          overlay_out_s: 1.5,
          episodeRef: 'ep1',
        },
        {
          id: 's3',
          clip: 's3.mp4',
          overlay_text: 'Episode two, shot one',
          overlay_out_s: 1.5,
          episodeRef: 'ep2',
        },
        {
          id: 's4',
          clip: 's4.mp4',
          overlay_text: 'Episode two, shot two',
          overlay_out_s: 1.5,
          episodeRef: 'ep2',
        },
      ],
      compilation: {
        episodes: [
          { ref: 'ep1', title: 'Episode One' },
          { ref: 'ep2', title: 'Episode Two' },
        ],
      },
      end_card: { subject: 'Test compilation', disclosure: 'AI visualisation' },
      outputs: ['fb'],
      gates: [],
      publish: [],
      captions: {},
      audio: { voice: 'bm_george', speed: 1 },
    });

    const uploadedFiles: Record<string, string> = {
      'jobs/job-1/uploads/s1/s1.mp4': clipPaths.s1,
      'jobs/job-1/uploads/s2/s2.mp4': clipPaths.s2,
      'jobs/job-1/uploads/s3/s3.mp4': clipPaths.s3,
      'jobs/job-1/uploads/s4/s4.mp4': clipPaths.s4,
    };

    const qaMeasurements = new Map<
      string,
      {
        durationSec: number;
        width: number;
        height: number;
        fps: number;
        integratedLufs: number;
        truePeakDb: number;
      }
    >();
    const statusUpdates: string[] = [];
    const failures: Array<{ stage: string; error: string; retryable: boolean }> = [];
    const stageStore = new Map<
      string,
      { hash: string; status: 'done' | 'failed'; outputs?: unknown }
    >();

    const deps: RunJobDeps = {
      jobsRepo: {
        async getById() {
          return {
            id: 'job-1',
            org_id: 'org-test',
            project_id: 'proj-1',
            manifest,
            status: 'created',
            created_at: '',
            updated_at: '',
          };
        },
        async updateStatus(_id: string, status: string) {
          statusUpdates.push(status);
        },
        async markFailed(
          _id: string,
          failure: { stage: string; error: string; retryable: boolean },
        ) {
          statusUpdates.push('failed');
          failures.push(failure);
        },
      } as never,
      projectsRepo: {
        async getById() {
          return {
            id: 'proj-1',
            org_id: 'org-test',
            slug: 'test-project',
            config: {
              slug: 'test-project',
              orgId: 'org-test',
              defaults: {
                template: 'compilation',
                voice: 'bm_george',
                speed: 1,
                outputs: ['fb'],
              },
              gates: [],
              publishTargets: [],
              providers: {
                tts: 'kokoro-js',
                captions: 'whisper',
                image: 'fal',
                storage: 'local',
                publish: 'facebook',
              },
              qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
            },
          };
        },
      } as never,
      createArtifactsRepo: () => ({ async record() {} }) as never,
      createStageStore: () =>
        ({
          async getLastRun(_jobId: string, stageName: string, outputId?: string) {
            return stageStore.get(`${stageName}:${outputId ?? ''}`) ?? null;
          },
          async recordStart() {},
          async recordEnd(_jobId: string, stageName: string, result: never, outputId?: string) {
            stageStore.set(`${stageName}:${outputId ?? ''}`, result);
          },
          async log() {},
        }) as never,
      createStorage: () =>
        ({
          async signedUrl(key: string) {
            return `https://fake-storage.test/${key}`;
          },
          async put({ key }: { localPath: string; key: string }) {
            return { url: `https://fake-storage.test/${key}` };
          },
          async presignUpload(key: string) {
            return `https://fake-storage.test/${key}`;
          },
        }) as never,
      synthesise: async ({ text }: { text: string }) => {
        void text;
        const wavPath = path.join(os.tmpdir(), `fake-vo-${Date.now()}-${Math.random()}.wav`);
        await writeFile(wavPath, 'fake-wav-bytes');
        return { wavPath, durationSec: 1.8 };
      },
      compileClipsOverlay,
      compileCaseFile: () => {
        throw new Error('compileCaseFile: not exercised by this compilation test');
      },
      compileStillsKenburns: () => {
        throw new Error('compileStillsKenburns: not exercised by this compilation test');
      },
      compileShorts916: () => {
        throw new Error('compileShorts916: not exercised by this compilation test');
      },
      compileCompilation,
      compileCarousel: () => {
        throw new Error('compileCarousel: not exercised by this compilation test');
      },
      renderCarouselStills: () => {
        throw new Error('renderCarouselStills: not exercised by this compilation test');
      },
      createCarouselPublishProviderFor: () => {
        throw new Error('createCarouselPublishProviderFor: not exercised by this compilation test');
      },
      parseShotlistV2: () => {
        throw new Error('parseShotlistV2: not exercised by this compilation test');
      },
      render: async (timeline, opts) => {
        await mkdir(opts.outputDir, { recursive: true });
        const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
        await writeFile(outputPath, 'fake-mp4-bytes');
        qaMeasurements.set(outputPath, {
          durationSec:
            timeline.scenes.reduce((sum, s) => sum + s.durationSecs, 0) +
            (timeline.cta?.durationSecs ?? 0),
          width: 1080,
          height: 1920,
          fps: 30,
          integratedLufs: -14,
          truePeakDb: -3,
        });
        return outputPath;
      },
      renderFfmpeg: async () => {
        throw new Error('renderFfmpeg: not exercised by this compilation test');
      },
      createPublishProviderFor: () =>
        ({
          async post() {
            return { postId: 'x' };
          },
        }) as never,
      measureVideo: async (localPath: string) => {
        const m = qaMeasurements.get(localPath);
        if (!m) throw new Error(`no fake qa measurement recorded for ${localPath}`);
        return m;
      },
      detectBlackFrames: async () => [],
      fetchFn: (async (url: string) => {
        const key = new URL(url).pathname.replace(/^\//, '');
        const localPath = uploadedFiles[key];
        if (!localPath) return new Response(null, { status: 404 });
        const bytes = await readFile(localPath);
        return new Response(bytes, { status: 200 });
      }) as unknown as typeof fetch,
    };

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(statusUpdates, ['queued', 'dispatched', 'running', 'delivered']);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: carousel handler renders N stills (real compileCarousel()), uploads them, and posts a real carousel via the carousel publish provider', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-carousel-test-'));
  try {
    const watermarkPath = path.join(workDir, 'logo.png');
    await writeFile(watermarkPath, 'fake-png-bytes');

    const manifest = Manifest.parse({
      version: '1',
      projectRef: 'test-project',
      template: 'carousel',
      visual: { mode: 'carousel' },
      carousel: {
        postCaption: 'A real carousel caption.',
        watermarkImage: 'logo.png',
        slides: [
          { headline: 'Slide one', showFolder: true },
          { headline: 'Slide two', body: 'Some body text.' },
          { headline: 'Slide three', showFolder: true },
        ],
      },
      outputs: ['fb'],
      gates: [],
      publish: ['facebook'],
      captions: {},
    });

    const uploadedFiles: Record<string, string> = {
      'jobs/job-1/uploads/watermark/logo.png': watermarkPath,
    };
    const statusUpdates: string[] = [];
    const failures: Array<{ stage: string; error: string; retryable: boolean }> = [];
    const artifacts: Array<{ kind: string; url: string }> = [];
    const publishCalls: Array<{
      platform: string;
      pageRef: string;
      images: string[];
      caption: string;
    }> = [];

    const deps: RunJobDeps = {
      jobsRepo: {
        async getById() {
          return {
            id: 'job-1',
            org_id: 'org-test',
            project_id: 'proj-1',
            manifest,
            status: 'created',
            created_at: '',
            updated_at: '',
          };
        },
        async updateStatus(_id: string, status: string) {
          statusUpdates.push(status);
        },
        async markFailed(
          _id: string,
          failure: { stage: string; error: string; retryable: boolean },
        ) {
          statusUpdates.push('failed');
          failures.push(failure);
        },
      } as never,
      projectsRepo: {
        async getById() {
          return {
            id: 'proj-1',
            org_id: 'org-test',
            slug: 'test-project',
            config: {
              slug: 'test-project',
              orgId: 'org-test',
              defaults: { template: 'carousel', voice: 'bm_george', speed: 1, outputs: ['fb'] },
              gates: [],
              publishTargets: [{ platform: 'facebook', credentialRef: 'TEST' }],
              providers: {
                tts: 'kokoro-js',
                captions: 'whisper',
                image: 'fal',
                storage: 'local',
                publish: 'facebook',
              },
              qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
            },
          };
        },
      } as never,
      createArtifactsRepo: () =>
        ({
          async record(_jobId: string, _stage: string, kind: string, url: string) {
            artifacts.push({ kind, url });
          },
        }) as never,
      createStageStore: () => ({}) as never,
      createStorage: () =>
        ({
          async signedUrl(key: string) {
            return `https://fake-storage.test/${key}`;
          },
          async put({ localPath, key }: { localPath: string; key: string }) {
            void localPath;
            return { url: `https://fake-storage.test/${key}` };
          },
          async presignUpload(key: string) {
            return `https://fake-storage.test/${key}`;
          },
        }) as never,
      synthesise: async () => {
        throw new Error('synthesise: not exercised by this carousel test');
      },
      compileClipsOverlay: () => {
        throw new Error('unreachable');
      },
      compileCaseFile: () => {
        throw new Error('unreachable');
      },
      compileStillsKenburns: () => {
        throw new Error('unreachable');
      },
      compileShorts916: () => {
        throw new Error('unreachable');
      },
      compileCompilation: () => {
        throw new Error('unreachable');
      },
      compileCarousel,
      renderCarouselStills: async (output, opts) => {
        await mkdir(opts.outputDir, { recursive: true });
        const outPaths: string[] = [];
        for (let i = 0; i < output.slides.length; i++) {
          const p = path.join(opts.outputDir, `slide-${i + 1}.png`);
          await writeFile(p, `fake-png-${i + 1}`);
          outPaths.push(p);
        }
        return outPaths;
      },
      createCarouselPublishProviderFor: (platform: string) =>
        ({
          async post(args: { pageRef: string; images: string[]; caption: string }) {
            publishCalls.push({ platform, ...args });
            return { postId: 'post-1', url: 'https://www.facebook.com/post-1' };
          },
        }) as never,
      parseShotlistV2: () => {
        throw new Error('unreachable');
      },
      render: async () => {
        throw new Error('render: not exercised by this carousel test');
      },
      createPublishProviderFor: () => {
        throw new Error('createPublishProviderFor: not exercised by this carousel test');
      },
      measureVideo: async () => {
        throw new Error('unreachable');
      },
      detectBlackFrames: async () => [],
      fetchFn: (async (url: string) => {
        const key = new URL(url).pathname.replace(/^\//, '');
        const localPath = uploadedFiles[key];
        if (!localPath) return new Response(null, { status: 404 });
        const bytes = await readFile(localPath);
        return new Response(bytes, { status: 200 });
      }) as unknown as typeof fetch,
    };

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(statusUpdates, ['queued', 'dispatched', 'running', 'delivered']);
    assert.equal(artifacts.filter((a) => a.kind === 'image').length, 3);
    assert.equal(publishCalls.length, 1);
    assert.equal(publishCalls[0].platform, 'facebook');
    assert.equal(publishCalls[0].pageRef, 'TEST');
    assert.equal(publishCalls[0].caption, 'A real carousel caption.');
    assert.equal(publishCalls[0].images.length, 3);
    const publishArtifact = artifacts.find((a) => a.kind === 'post');
    assert.equal(publishArtifact?.url, 'https://www.facebook.com/post-1');
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: carousel handler stops at awaiting_review when the job has gates, without publishing', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-carousel-gated-test-'));
  try {
    const manifest = Manifest.parse({
      version: '1',
      projectRef: 'test-project',
      template: 'carousel',
      visual: { mode: 'carousel' },
      carousel: {
        postCaption: 'x',
        slides: [{ headline: 'A' }, { headline: 'B' }],
      },
      outputs: ['fb'],
      gates: ['image-quality'],
      publish: ['facebook'],
      captions: {},
    });

    const statusUpdates: string[] = [];

    const failures: Array<{ stage: string; error: string; retryable: boolean }> = [];
    let publishCalled = false;

    const deps: RunJobDeps = {
      jobsRepo: {
        async getById() {
          return {
            id: 'job-1',
            org_id: 'org-test',
            project_id: 'proj-1',
            manifest,
            status: 'created',
            created_at: '',
            updated_at: '',
          };
        },
        async updateStatus(_id: string, status: string) {
          statusUpdates.push(status);
        },
        async markFailed(
          _id: string,
          failure: { stage: string; error: string; retryable: boolean },
        ) {
          statusUpdates.push('failed');
          failures.push(failure);
        },
      } as never,
      projectsRepo: {
        async getById() {
          return {
            id: 'proj-1',
            org_id: 'org-test',
            slug: 'test-project',
            config: {
              slug: 'test-project',
              orgId: 'org-test',
              defaults: { template: 'carousel', voice: 'bm_george', speed: 1, outputs: ['fb'] },
              gates: ['image-quality'],
              publishTargets: [{ platform: 'facebook', credentialRef: 'TEST' }],
              providers: {
                tts: 'kokoro-js',
                captions: 'whisper',
                image: 'fal',
                storage: 'local',
                publish: 'facebook',
              },
              qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
            },
          };
        },
      } as never,
      createArtifactsRepo: () => ({ async record() {} }) as never,
      createStageStore: () => ({}) as never,
      createStorage: () =>
        ({
          async signedUrl(key: string) {
            return `https://fake-storage.test/${key}`;
          },
          async put({ key }: { localPath: string; key: string }) {
            return { url: `https://fake-storage.test/${key}` };
          },
          async presignUpload(key: string) {
            return `https://fake-storage.test/${key}`;
          },
        }) as never,
      synthesise: async () => {
        throw new Error('unreachable');
      },
      compileClipsOverlay: () => {
        throw new Error('unreachable');
      },
      compileCaseFile: () => {
        throw new Error('unreachable');
      },
      compileStillsKenburns: () => {
        throw new Error('unreachable');
      },
      compileShorts916: () => {
        throw new Error('unreachable');
      },
      compileCompilation: () => {
        throw new Error('unreachable');
      },
      compileCarousel,
      renderCarouselStills: async (output, opts) => {
        await mkdir(opts.outputDir, { recursive: true });
        const outPaths: string[] = [];
        for (let i = 0; i < output.slides.length; i++) {
          const p = path.join(opts.outputDir, `slide-${i + 1}.png`);
          await writeFile(p, `fake-png-${i + 1}`);
          outPaths.push(p);
        }
        return outPaths;
      },
      createCarouselPublishProviderFor: () =>
        ({
          async post() {
            publishCalled = true;
            return { postId: 'x' };
          },
        }) as never,
      parseShotlistV2: () => {
        throw new Error('unreachable');
      },
      render: async () => {
        throw new Error('unreachable');
      },
      createPublishProviderFor: () => {
        throw new Error('unreachable');
      },
      measureVideo: async () => {
        throw new Error('unreachable');
      },
      detectBlackFrames: async () => [],
    };

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.deepEqual(statusUpdates, [
      'queued',
      'dispatched',
      'running',
      'awaiting_review:image-quality',
    ]);
    assert.equal(publishCalled, false);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

function publishOnlyDeps(
  rows: Array<{
    stage_name: string;
    kind: string;
    url: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>,
) {
  const deps = fakeDeps('/unused.mp4', { publish: ['facebook'], gates: ['review'] });
  const recorded: Array<{ stage: string; kind: string; url: string }> = [];
  deps.createArtifactsRepo = () =>
    ({
      async listForJob() {
        return rows;
      },
      async record(_jobId: string, stage: string, kind: string, url: string) {
        recorded.push({ stage, kind, url });
      },
    }) as never;
  deps.render = async () => {
    throw new Error('publish-only mode must not render');
  };
  deps.synthesise = async () => {
    throw new Error('publish-only mode must not synthesise');
  };
  return { deps, recorded };
}

test('runJob publish mode: posts the latest rendered video without re-rendering, then delivers', async () => {
  const { deps, recorded } = publishOnlyDeps([
    {
      stage_name: 'render',
      kind: 'video',
      url: 'https://r2.test/old/fb.mp4',
      metadata: { outputId: 'fb' },
      created_at: '2026-10-14T06:00:00Z',
    },
    {
      stage_name: 'render',
      kind: 'video',
      url: 'https://r2.test/new/fb.mp4',
      metadata: { outputId: 'fb' },
      created_at: '2026-10-14T07:00:00Z',
    },
  ]);

  await runJob({ jobId: 'job-1', mode: 'publish' }, deps, createLogger({ level: 'error' }));

  assert.equal(deps.statusUpdates.at(-1), 'delivered');
  assert.equal(deps.publishCalls.length, 1);
  assert.equal(deps.publishCalls[0].video, 'https://r2.test/new/fb.mp4');
  assert.equal(deps.publishCalls[0].pageRef, 'TEST');
  assert.deepEqual(recorded, [{ stage: 'publish', kind: 'post', url: 'https://facebook.com/p1' }]);
});

test('runJob publish mode: never re-posts a platform that already has a publish artifact', async () => {
  const { deps } = publishOnlyDeps([
    {
      stage_name: 'render',
      kind: 'video',
      url: 'https://r2.test/fb.mp4',
      metadata: { outputId: 'fb' },
      created_at: '2026-10-14T07:00:00Z',
    },
    {
      stage_name: 'publish',
      kind: 'post',
      url: 'https://facebook.com/p0',
      metadata: { platform: 'facebook', postId: 'p0' },
      created_at: '2026-10-14T07:01:00Z',
    },
  ]);

  await runJob({ jobId: 'job-1', mode: 'publish' }, deps, createLogger({ level: 'error' }));

  assert.equal(deps.publishCalls.length, 0);
  assert.equal(deps.statusUpdates.at(-1), 'delivered');
});

function scheduledRows(publishAt: string) {
  return [
    {
      stage_name: 'render',
      kind: 'video',
      url: 'https://r2.test/fb.mp4',
      metadata: { outputId: 'fb' },
      created_at: '2026-10-30T07:00:00Z',
    },
    {
      stage_name: 'review',
      kind: 'gate-approval',
      url: '',
      metadata: { gate: 'review', publishAt },
      created_at: '2026-10-30T08:00:00Z',
    },
  ];
}

test("runJob publish mode: schedules the post for the approval's publishAt", async () => {
  const { deps } = publishOnlyDeps(scheduledRows('2026-10-30T23:00:00.000Z'));
  deps.now = () => Date.parse('2026-10-30T08:01:00Z');

  await runJob({ jobId: 'job-1', mode: 'publish' }, deps, createLogger({ level: 'error' }));

  assert.equal(deps.publishCalls[0].scheduleAt, '2026-10-30T23:00:00.000Z');
  assert.equal(deps.statusUpdates.at(-1), 'delivered');
});

test('runJob publish mode: a scheduled time that has already come posts now', async () => {
  const { deps } = publishOnlyDeps(scheduledRows('2026-10-30T08:05:00.000Z'));
  deps.now = () => Date.parse('2026-10-30T08:01:00Z');

  await runJob({ jobId: 'job-1', mode: 'publish' }, deps, createLogger({ level: 'error' }));

  assert.equal(deps.publishCalls[0].scheduleAt, undefined);
  assert.equal(deps.statusUpdates.at(-1), 'delivered');
});

test('runJob publish mode: fails clearly when the job has no rendered video', async () => {
  const { deps } = publishOnlyDeps([]);

  await assert.rejects(
    () => runJob({ jobId: 'job-1', mode: 'publish' }, deps, createLogger({ level: 'error' })),
    /no rendered video for "facebook"/,
  );
  assert.equal(deps.publishCalls.length, 0);
  assert.equal(deps.statusUpdates.at(-1), 'failed');
  assert.deepEqual(
    { stage: deps.failures[0].stage, retryable: deps.failures[0].retryable },
    { stage: 'publish', retryable: false },
  );
});

test('runJob: a missing upload fails at the assets step, not retryable', async () => {
  const deps = fakeDeps('/unused.mp4');
  deps.fetchFn = (async () =>
    new Response('not found', { status: 404 })) as unknown as typeof fetch;

  await assert.rejects(
    () => runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' })),
    /raw asset not found for shot "s1"/,
  );
  assert.equal(deps.statusUpdates.at(-1), 'failed');
  assert.deepEqual(
    { stage: deps.failures[0].stage, retryable: deps.failures[0].retryable },
    { stage: 'assets', retryable: false },
  );
});

test('runJob: clips-overlay mixes in a library music bed picked by mood, and records it', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-test-'));
  try {
    const clipPath = path.join(workDir, 's1.mp4');
    await makeSyntheticClip(clipPath);

    const deps = fakeDeps(clipPath, {
      audio: { voice: 'bm_george', speed: 1, music: { mood: 'tension' } },
    });
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
          file: 'hope-01.mp3',
          source: 'pixabay',
          licence: 'pixabay-content-license',
          moods: ['hope'],
        },
      ],
    };
    const clipFetch = deps.fetchFn!;
    deps.fetchFn = (async (url: string) => {
      if (url.endsWith('music/library.json')) return new Response(JSON.stringify(library));
      if (url.endsWith('music/tension-01.mp3')) return new Response('tension-bytes');
      return clipFetch(url);
    }) as typeof fetch;
    const rendered: Array<string | undefined> = [];
    const render = deps.render;
    deps.render = async (timeline, opts) => {
      rendered.push(timeline.music?.path);
      return render(timeline, opts);
    };

    await runJob({ jobId: 'job-1' }, deps, createLogger({ level: 'error' }));

    assert.equal(deps.statusUpdates.at(-1), 'delivered');
    assert.equal(rendered.length, 1);
    assert.match(rendered[0] ?? '', /music[\\/]tension-01\.mp3$/);
    assert.ok(
      deps.artifacts.some((a) => a.kind === 'music-bed' && a.url === 'music/tension-01.mp3'),
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

// ---- Track P (P.4): assets_review gate + case-file brand watermark ----

function gatedCaseFileWorld(imagePath: string, logoPath: string) {
  const manifest = Manifest.parse({
    version: '1',
    projectRef: 'test-project',
    template: 'case-file',
    visual: { mode: 'case-file' },
    shots: [
      {
        id: 's1',
        image: 'doc1.png',
        voiceover_text: 'A narrated page.',
        highlights: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.05 }],
      },
    ],
    case_file: { caseId: 'test-case', aspectRatio: '16:9' },
    outputs: ['fb'],
    gates: ['assets_review'],
    publish: [],
    captions: {},
  });
  const statusUpdates: string[] = [];
  const failures: Array<{ stage: string; error: string }> = [];
  const artifacts: Array<{ stage_name: string; kind: string; url: string }> = [];
  const rendered: Array<{ watermark?: { path?: string } }> = [];
  const drawn: string[] = [];
  let status = 'queued';
  const stageStore = new Map<string, unknown>();

  const deps: RunJobDeps = {
    jobsRepo: {
      async getById() {
        return {
          id: 'job-1',
          org_id: 'org-test',
          project_id: 'proj-1',
          manifest,
          status,
          created_at: '',
          updated_at: '',
        };
      },
      async updateStatus(_id: string, s: string) {
        statusUpdates.push(s);
        status = s;
      },
      async markFailed(_id: string, failure: { stage: string; error: string }) {
        statusUpdates.push('failed');
        failures.push(failure);
      },
    } as never,
    projectsRepo: {
      async getById() {
        return {
          id: 'proj-1',
          org_id: 'org-test',
          slug: 'test-project',
          config: {
            slug: 'test-project',
            orgId: 'org-test',
            brand: { fonts: [], colours: [], musicBeds: [], watermark: 'brand/test/logo.png' },
            defaults: { template: 'case-file', voice: 'bm_george', speed: 1, outputs: ['fb'] },
            gates: [],
            publishTargets: [],
            providers: {
              tts: 'kokoro-js',
              captions: 'whisper',
              image: 'fal',
              storage: 'local',
              publish: 'facebook',
            },
            qa: { targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false },
          },
        };
      },
    } as never,
    createArtifactsRepo: () =>
      ({
        async record(_job: string, stage_name: string, kind: string, url: string) {
          artifacts.push({ stage_name, kind, url });
          return {};
        },
        async listForJob() {
          return artifacts;
        },
      }) as never,
    createStageStore: () =>
      ({
        async getLastRun(_jobId: string, stageName: string, outputId?: string) {
          return stageStore.get(`${stageName}:${outputId ?? ''}`) ?? null;
        },
        async recordStart() {},
        async recordEnd(_jobId: string, stageName: string, result: never, outputId?: string) {
          stageStore.set(`${stageName}:${outputId ?? ''}`, result);
        },
        async log() {},
      }) as never,
    createStorage: () =>
      ({
        async signedUrl(key: string) {
          return `https://fake-storage.test/${key}`;
        },
        async put({ key }: { localPath: string; key: string }) {
          return { url: `https://fake-storage.test/${key}` };
        },
        async presignUpload(key: string) {
          return key;
        },
      }) as never,
    synthesise: async () => {
      const wavPath = path.join(os.tmpdir(), `fake-vo-${Date.now()}.wav`);
      await writeFile(wavPath, 'fake-wav-bytes');
      return { wavPath, durationSec: 3.0 };
    },
    compileClipsOverlay: () => {
      throw new Error('not used');
    },
    compileCaseFile,
    compileStillsKenburns: () => {
      throw new Error('not used');
    },
    compileShorts916: () => {
      throw new Error('not used');
    },
    compileCompilation: () => {
      throw new Error('not used');
    },
    compileCarousel: () => {
      throw new Error('not used');
    },
    renderCarouselStills: () => {
      throw new Error('not used');
    },
    createCarouselPublishProviderFor: () => {
      throw new Error('not used');
    },
    parseShotlistV2: () => {
      throw new Error('not used');
    },
    render: async (timeline, opts) => {
      await mkdir(opts.outputDir, { recursive: true });
      const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
      await writeFile(outputPath, 'fake-mp4-bytes');
      rendered.push(timeline as never);
      return outputPath;
    },
    createPublishProviderFor: () => {
      throw new Error('not used');
    },
    measureVideo: async () => ({
      durationSec: 3 + 2.5,
      width: 1920,
      height: 1080,
      fps: 30,
      integratedLufs: -14,
      truePeakDb: -3,
    }),
    detectBlackFrames: async () => [],
    drawProof: async ({ output }) => {
      drawn.push(output);
      await writeFile(output, 'proof');
    },
    fetchFn: (async (url: string) => {
      const file = url.endsWith('/logo.png') ? logoPath : imagePath;
      return new Response(new Uint8Array(await readFile(file)), { status: 200 });
    }) as unknown as typeof fetch,
  };
  return { deps, statusUpdates, failures, artifacts, rendered, drawn };
}

test('runJob: assets_review stops before rendering with proofs, then renders (with the brand watermark) once approved', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-assets-review-'));
  try {
    const imagePath = path.join(workDir, 'doc1.png');
    const logoPath = path.join(workDir, 'logo.png');
    await writeFile(imagePath, 'fake-image-bytes');
    await writeFile(logoPath, 'fake-logo-bytes');
    const w = gatedCaseFileWorld(imagePath, logoPath);
    const logger = createLogger({ level: 'error' });

    await runJob({ jobId: 'job-1' }, w.deps, logger);
    assert.deepEqual(w.statusUpdates, ['dispatched', 'running', 'awaiting_review:assets_review']);
    assert.equal(w.rendered.length, 0);
    assert.equal(w.drawn.length, 1);
    assert.deepEqual(
      w.artifacts.map((a) => [a.stage_name, a.kind, a.url]),
      [
        [
          'assets_review',
          'assets-proof',
          'https://fake-storage.test/jobs/job-1/review/assets_review/s1.png',
        ],
      ],
    );

    // What approveGate does for a pre-render gate: record + re-queue.
    w.artifacts.push({ stage_name: 'assets_review', kind: 'gate-approval', url: '' });
    await w.deps.jobsRepo.updateStatus('job-1', 'queued');
    w.statusUpdates.length = 0;

    await runJob({ jobId: 'job-1' }, w.deps, logger);
    assert.deepEqual(w.failures, []);
    assert.deepEqual(w.statusUpdates, ['dispatched', 'running', 'delivered']);
    assert.equal(w.rendered.length, 1);
    assert.equal(w.drawn.length, 1, 'no new proofs once approved');
    assert.ok(w.rendered[0]!.watermark?.path?.endsWith(`${path.sep}logo.png`));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runJob: a brand watermark that cannot be downloaded fails the job, never renders unbranded', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-job-watermark-'));
  try {
    const imagePath = path.join(workDir, 'doc1.png');
    await writeFile(imagePath, 'fake-image-bytes');
    const w = gatedCaseFileWorld(imagePath, path.join(workDir, 'missing.png'));
    w.artifacts.push({ stage_name: 'assets_review', kind: 'gate-approval', url: '' });
    w.deps.fetchFn = (async (url: string) =>
      url.endsWith('/logo.png')
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array(await readFile(imagePath)))) as unknown as typeof fetch;

    await runJob({ jobId: 'job-1' }, w.deps, createLogger({ level: 'error' })).catch(() => {});
    assert.equal(w.rendered.length, 0);
    assert.equal(w.statusUpdates.at(-1), 'failed');
    assert.match(
      w.failures[0]!.error,
      /brand watermark "brand\/test\/logo.png" could not be downloaded/,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
