import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

import { buildEpisodeShots, buildCompilationSeriesDefaults } from '../src/build-props.ts';
import { shotDurationInFrames } from '../src/props.ts';
import {
  PILOT_ROOT,
  PUBLIC_DIR,
  PAGE_NAME,
  loadPack,
  contentBaseFor,
  resetStage,
  stageDirAssets,
} from './lib/render-shared.ts';
import type { CompilationProps } from '../src/props.ts';

function parseArgs(argv: string[]): { seriesDir: string; out: string } {
  const [seriesDir, ...rest] = argv;
  if (!seriesDir) {
    console.error('Usage: npm run render:compilation <series-dir> [--out <name>]');
    process.exit(1);
  }
  let out = 'compilation';
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--out') out = rest[++i];
  }
  return { seriesDir, out };
}

// Episodes are `<series-dir>/ep<N>/`, read in numeric N order.
async function findEpisodeDirs(seriesDir: string): Promise<string[]> {
  const entries = await readdir(seriesDir, { withFileTypes: true });
  const episodeDirs = entries
    .filter((e) => e.isDirectory() && /^ep\d+$/.test(e.name))
    .map((e) => ({ name: e.name, n: parseInt(e.name.slice(2), 10) }))
    .sort((a, b) => a.n - b.n);

  if (episodeDirs.length === 0) {
    console.error(`No ep<N> directories found in ${seriesDir}`);
    process.exit(1);
  }
  return episodeDirs.map((e) => path.join(seriesDir, e.name));
}

async function main() {
  const { seriesDir: seriesDirArg, out } = parseArgs(process.argv.slice(2));
  const seriesDir = path.resolve(seriesDirArg);
  const episodeDirs = await findEpisodeDirs(seriesDir);

  console.log(
    `Found ${episodeDirs.length} episode(s): ${episodeDirs.map((d) => path.basename(d)).join(', ')}`,
  );

  console.log('Staging assets...');
  await resetStage();
  const packs = [];
  for (const dir of episodeDirs) {
    const pack = await loadPack(dir);
    const contentBase = contentBaseFor(dir);
    await stageDirAssets(dir, contentBase);
    packs.push({ dir, contentBase, pack });
  }

  // Series-level fields (music/end card/watermark) aren't per-episode in the
  // Pack schema — ep1's pack is the source of truth for them (see
  // buildCompilationSeriesDefaults's doc comment).
  const seriesDefaults = buildCompilationSeriesDefaults(
    packs[0].pack,
    packs[0].contentBase,
    PAGE_NAME,
  );

  const episodes = packs.map(({ pack, contentBase }) => ({
    title: pack.subject,
    shots: buildEpisodeShots(pack, contentBase),
  }));

  const inputProps: CompilationProps = { episodes, ...seriesDefaults };

  // Warn (don't fail) if the compilation's body runs over target — target
  // comes from the first episode pack that sets compilation_target_s.
  const targetS = packs.map((p) => p.pack.compilation_target_s).find((t) => t !== undefined);
  if (targetS !== undefined) {
    const fps = 30;
    const bodyS = episodes.reduce(
      (sum, ep) => sum + ep.shots.reduce((s, shot) => s + shotDurationInFrames(shot, fps) / fps, 0),
      0,
    );
    if (bodyS > targetS) {
      console.warn(
        `Warning: compilation body ${bodyS.toFixed(1)}s exceeds compilation_target_s (${targetS}s)`,
      );
    }
  }

  console.log('Bundling...');
  const bundled = await bundle({
    entryPoint: path.join(PILOT_ROOT, 'src', 'index.ts'),
    publicDir: PUBLIC_DIR,
  });

  const outDir = path.join(seriesDir, 'out');
  await mkdir(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${out}.mp4`);

  const start = Date.now();
  try {
    const composition = await selectComposition({
      serveUrl: bundled,
      id: 'Compilation',
      inputProps,
    });
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      crf: 18,
      audioCodec: 'aac',
      audioBitrate: '192k',
    });
    const elapsedS = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ ${out} → ${outputPath} (${elapsedS}s)`);
  } catch (err) {
    const elapsedS = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`✗ ${out} failed after ${elapsedS}s:`, err instanceof Error ? err.message : err);
    await resetStage();
    process.exit(1);
  }

  await resetStage();
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
