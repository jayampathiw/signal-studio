import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { Manifest } from '@signal-studio/core/schemas';
import { compile as compileClipsOverlay } from '@signal-studio/template-clips-overlay/compile';

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
};

type FakeDeps = RunJobDeps & {
  statusUpdates: string[];
  artifacts: Array<{ kind: string; url: string }>;
  publishCalls: Array<{ platform: string; pageRef: string; video: string; caption: string }>;
};

function fakeDeps(clipPath: string, manifestOverrides: Record<string, unknown> = {}): FakeDeps {
  const statusUpdates: string[] = [];
  const artifacts: Array<{ kind: string; url: string }> = [];
  const publishCalls: FakeDeps['publishCalls'] = [];
  const stageStore = new Map<
    string,
    { hash: string; status: 'done' | 'failed'; outputs?: unknown }
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
    render: async (timeline, opts) => {
      await mkdir(opts.outputDir, { recursive: true });
      const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
      await writeFile(outputPath, 'fake-mp4-bytes');
      return outputPath;
    },
    createPublishProviderFor: (platform: string) =>
      ({
        async post(args: { pageRef: string; video: string; caption: string }) {
          publishCalls.push({ platform, ...args });
          return { postId: 'p1', url: 'https://facebook.com/p1' };
        },
      }) as never,
    fetchFn: (async () => {
      const bytes = await readFile(clipPath);
      return new Response(bytes, { status: 200 });
    }) as unknown as typeof fetch,
    statusUpdates,
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
