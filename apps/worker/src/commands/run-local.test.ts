import { execFile } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

import { compile as compileClipsOverlay } from '@signal-studio/template-clips-overlay/compile';

import { runLocal } from './run-local.ts';
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

test('runLocal: full pipeline (real assets-stage ffmpeg, fake tts + render) writes an output per manifest output', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-local-test-'));
  try {
    await mkdir(path.join(workDir, 'clips', 'raw'), { recursive: true });
    await makeSyntheticClip(path.join(workDir, 'clips', 'raw', 's1.mp4'));

    const manifest = {
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
        },
      ],
      end_card: { subject: 'Test subject', disclosure: 'AI visualisation' },
      outputs: ['fb'],
    };
    const project = {
      slug: 'test-project',
      orgId: 'org-test',
      defaults: { template: 'clips-overlay', voice: 'bm_george', speed: 1, outputs: ['fb'] },
      providers: {
        tts: 'kokoro-js',
        captions: 'whisper',
        image: 'fal',
        storage: 'local',
        publish: 'facebook',
      },
    };
    await writeFile(path.join(workDir, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(workDir, 'project.json'), JSON.stringify(project));

    const renderedTimelines: unknown[] = [];
    const result = await runLocal(
      {
        manifestPath: path.join(workDir, 'manifest.json'),
        projectPath: path.join(workDir, 'project.json'),
        outDir: path.join(workDir, 'out'),
      },
      {
        synthesise: async () => {
          const wavPath = path.join(workDir, 'fake-vo.wav');
          await writeFile(wavPath, 'fake-wav-bytes');
          return { wavPath, durationSec: 1.8 };
        },
        compileClipsOverlay,
        render: async (timeline, renderOpts) => {
          renderedTimelines.push(timeline);
          const outputPath = path.join(renderOpts.outputDir, `${timeline.contentId}.mp4`);
          await mkdir(renderOpts.outputDir, { recursive: true });
          await writeFile(outputPath, 'fake-mp4-bytes');
          return outputPath;
        },
      },
      createLogger({ level: 'error' }), // quiet during tests
    );

    assert.deepEqual(Object.keys(result.outputs), ['fb']);
    assert.equal(renderedTimelines.length, 1);
    const timeline = renderedTimelines[0] as {
      scenes: Array<{ id: string; narrationPath?: string }>;
    };
    assert.equal(timeline.scenes.length, 1);
    assert.equal(timeline.scenes[0].id, 's1');
    assert.ok(timeline.scenes[0].narrationPath?.endsWith('vo/s1.wav'));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('runLocal: throws a clear error for a non-clips-overlay template', async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'run-local-test-'));
  try {
    const manifest = {
      version: '1',
      projectRef: 'test-project',
      template: 'compilation',
      visual: { mode: 'compilation' },
      shots: [{ id: 's1', image: 'still.jpg', overlay_out_s: 1, voiceover_text: 'x' }],
      end_card: { subject: 'x', disclosure: 'x' },
      outputs: ['fb'],
    };
    const project = {
      slug: 'test-project',
      orgId: 'org-test',
      defaults: { template: 'compilation', voice: 'bm_george', speed: 1, outputs: ['fb'] },
      providers: {
        tts: 'kokoro-js',
        captions: 'whisper',
        image: 'fal',
        storage: 'local',
        publish: 'facebook',
      },
    };
    await writeFile(path.join(workDir, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(path.join(workDir, 'project.json'), JSON.stringify(project));

    await assert.rejects(
      () =>
        runLocal(
          {
            manifestPath: path.join(workDir, 'manifest.json'),
            projectPath: path.join(workDir, 'project.json'),
            outDir: workDir,
          },
          {
            synthesise: async () => ({ wavPath: '', durationSec: 0 }),
            compileClipsOverlay,
            render: async () => '',
          },
          createLogger({ level: 'error' }),
        ),
      /only "clips-overlay" is supported/,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
