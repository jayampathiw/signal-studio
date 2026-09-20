import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { resolveJob } from '@signal-studio/core/resolve';
import type { ProjectT } from '@signal-studio/core/schemas';

import { compile, type ShotAssetT, type ShotVoiceoverT } from './compile.ts';

// packages/templates/clips-overlay/../../../projects/assemblex-factory/packs
const PACKS_DIR = path.resolve(import.meta.dirname, '../../../../projects/assemblex-factory/packs');
const PILOT_PACK_PATH = path.resolve(
  PACKS_DIR,
  '../content/2026-W38/standalone_sample-001/pack.json',
);

const TEST_PROJECT: ProjectT = {
  slug: 'assemblex-factory',
  orgId: 'org-test',
  brand: { fonts: [], colours: [], musicBeds: [] },
  defaults: { template: 'clips-overlay', voice: 'bm_george', speed: 1, outputs: ['fb', 'ig'] },
  gates: [],
  publishTargets: [],
  providers: {
    tts: 'kokoro-js',
    captions: 'whisper',
    image: 'fal',
    storage: 'r2',
    publish: 'facebook',
  },
};

async function loadResolvedJob() {
  // Dynamic import so this test doesn't depend on @assemblex/packs' own
  // package resolution order relative to this workspace package.
  const { packToManifest, Pack } = await import(path.join(PACKS_DIR, 'blbl.v1.ts'));
  const raw = JSON.parse(await readFile(PILOT_PACK_PATH, 'utf8'));
  const pack = Pack.parse(raw);
  const manifest = packToManifest(pack, { projectRef: 'assemblex-factory' });
  return { resolvedJob: resolveJob(TEST_PROJECT, manifest), pack };
}

// pack.json's shots already carry the pilot's own written-back
// duration_s/voiceover_file/voiceover_duration_s (P0.8's real measured
// output) — manifest.v1 drops those fields (P2.3's adapter notes), so this
// test sources shotAssets/shotVoiceovers from the raw pack directly, the
// same way a real `ss run-local` would source them from the assets/tts
// stages' actual output instead.
function assetsAndVoiceoversFromPack(pack: {
  shots: Array<{
    id: string;
    duration_s?: number;
    voiceover_file?: string;
    voiceover_duration_s?: number;
  }>;
}) {
  const shotAssets: Record<string, ShotAssetT> = {};
  const shotVoiceovers: Record<string, ShotVoiceoverT> = {};
  for (const shot of pack.shots) {
    shotAssets[shot.id] = { clipPath: `/clips/${shot.id}.mp4`, durationS: shot.duration_s ?? 0 };
    if (shot.voiceover_file) {
      shotVoiceovers[shot.id] = {
        path: `/vo/${shot.id}.wav`,
        durationS: shot.voiceover_duration_s ?? 0,
      };
    }
  }
  return { shotAssets, shotVoiceovers };
}

test('compile: fb output keeps every shot, produces a valid Timeline', async () => {
  const { resolvedJob, pack } = await loadResolvedJob();
  const { shotAssets, shotVoiceovers } = assetsAndVoiceoversFromPack(pack);

  const timeline = compile(resolvedJob, {
    contentId: 'standalone_sample-001',
    outputId: 'fb',
    shotAssets,
    shotVoiceovers,
  });

  assert.equal(timeline.template, 'clips-overlay');
  assert.equal(timeline.outputId, 'fb');
  assert.equal(timeline.aspectRatio, '9:16');
  assert.equal(timeline.scenes.length, 3); // s1, s2, s3 — none dropped for fb
  assert.deepEqual(
    timeline.scenes.map((s) => s.id),
    ['s1', 's2', 's3'],
  );
});

test('compile: ig output drops ig_optional shots (s3)', async () => {
  const { resolvedJob, pack } = await loadResolvedJob();
  const { shotAssets, shotVoiceovers } = assetsAndVoiceoversFromPack(pack);

  const timeline = compile(resolvedJob, {
    contentId: 'standalone_sample-001',
    outputId: 'ig',
    shotAssets,
    shotVoiceovers,
  });

  assert.equal(timeline.outputId, 'ig');
  assert.deepEqual(
    timeline.scenes.map((s) => s.id),
    ['s1', 's2'],
  );
});

test('compile: scene fields map correctly — duration/speed, overlay, VO start, source', async () => {
  const { resolvedJob, pack } = await loadResolvedJob();
  const { shotAssets, shotVoiceovers } = assetsAndVoiceoversFromPack(pack);

  const timeline = compile(resolvedJob, {
    contentId: 'standalone_sample-001',
    outputId: 'fb',
    shotAssets,
    shotVoiceovers,
  });

  const s1 = timeline.scenes[0];
  const packS1 = pack.shots[0];
  assert.equal(s1.durationSecs, packS1.duration_s / packS1.speed);
  assert.equal(s1.playbackRate, packS1.speed);
  assert.equal(s1.trimInSec, packS1.trim_in_s);
  assert.equal(s1.sourceMuted, !packS1.audio.keep_native_sfx);
  assert.equal(s1.overlay?.text, packS1.overlay_text);
  assert.equal(s1.overlay?.inSec, packS1.overlay_in_s);
  assert.equal(s1.overlay?.outSec, packS1.overlay_out_s);
  assert.equal(s1.voStartSec, packS1.overlay_in_s);
  assert.equal(s1.source?.localPath, shotAssets.s1.clipPath);
  assert.equal(s1.narrationPath, shotVoiceovers.s1.path);
});

test('compile: music, cta (end card), watermark map from manifest', async () => {
  const { resolvedJob, pack } = await loadResolvedJob();
  const { shotAssets, shotVoiceovers } = assetsAndVoiceoversFromPack(pack);

  const timeline = compile(resolvedJob, {
    contentId: 'standalone_sample-001',
    outputId: 'fb',
    shotAssets,
    shotVoiceovers,
  });

  assert.equal(timeline.music, undefined); // pack.json's music has no `file`
  assert.equal(timeline.cta?.line1, pack.end_card.subject);
  assert.equal(timeline.cta?.line2, pack.end_card.disclosure);
  assert.equal(timeline.cta?.position, 'end');
  assert.equal(timeline.watermark?.text, pack.watermark.text);
  assert.equal(timeline.watermark?.position, 'top-left');
});

test('compile: throws a clear error when a shot is missing its assets-stage output', async () => {
  const { resolvedJob } = await loadResolvedJob();

  assert.throws(
    () =>
      compile(resolvedJob, {
        contentId: 'standalone_sample-001',
        outputId: 'fb',
        shotAssets: {}, // nothing measured yet
        shotVoiceovers: {},
      }),
    /missing shotAssets\["s1"\]/,
  );
});
