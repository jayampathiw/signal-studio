import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

import { buildPostProps } from '../src/build-props.ts';
import type { PackT } from '../src/manifest.ts';
import {
  PILOT_ROOT,
  PUBLIC_DIR,
  PAGE_NAME,
  loadPack,
  contentBaseFor,
  resetStage,
  stageDirAssets,
} from './lib/render-shared.ts';

type Args = {
  dirs: string[];
  only?: string;
  variant?: 'fb' | 'ig';
};

function parseArgs(argv: string[]): Args {
  const dirs: string[] = [];
  let only: string | undefined;
  let variant: 'fb' | 'ig' | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') {
      only = argv[++i];
    } else if (arg === '--variant') {
      const v = argv[++i];
      if (v !== 'fb' && v !== 'ig') {
        console.error(`--variant must be "fb" or "ig", got "${v}"`);
        process.exit(1);
      }
      variant = v;
    } else {
      dirs.push(arg);
    }
  }

  if (dirs.length === 0) {
    console.error(
      'Usage: npm run render <pack-dir> [<pack-dir> ...] [--only <post_id>] [--variant fb|ig]',
    );
    process.exit(1);
  }

  return { dirs, only, variant };
}

type Post = { dir: string; contentBase: string; pack: PackT };

async function loadPosts(dirArgs: string[], only: string | undefined): Promise<Post[]> {
  const posts: Post[] = [];
  for (const dirArg of dirArgs) {
    const dir = path.resolve(dirArg);
    const pack = await loadPack(dir);
    if (only && pack.post_id !== only) {
      console.log(`Skipping ${pack.post_id} (--only ${only})`);
      continue;
    }
    posts.push({ dir, contentBase: contentBaseFor(dir), pack });
  }
  return posts;
}

async function main() {
  const { dirs, only, variant: variantFilter } = parseArgs(process.argv.slice(2));
  const posts = await loadPosts(dirs, only);

  console.log(`Staging assets for ${posts.length} post(s)...`);
  await resetStage();
  for (const { dir, contentBase } of posts) await stageDirAssets(dir, contentBase);

  console.log('Bundling once for all posts...');
  const bundled = await bundle({
    entryPoint: path.join(PILOT_ROOT, 'src', 'index.ts'),
    publicDir: PUBLIC_DIR,
  });

  let hadFailure = false;

  try {
    for (const { dir, contentBase, pack } of posts) {
      const outDir = path.join(dir, 'out');
      await mkdir(outDir, { recursive: true });

      const variants = variantFilter ? [variantFilter] : (pack.outputs as Array<'fb' | 'ig'>);

      for (const variant of variants) {
        const label = `${pack.post_id}_${variant}`;
        const inputProps = buildPostProps(pack, contentBase, variant, PAGE_NAME);
        const outputPath = path.join(outDir, `${label}.mp4`);

        const start = Date.now();
        try {
          const composition = await selectComposition({
            serveUrl: bundled,
            id: 'Post',
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
          console.log(`✓ ${label} → ${outputPath} (${elapsedS}s)`);
        } catch (err) {
          const elapsedS = ((Date.now() - start) / 1000).toFixed(1);
          console.error(
            `✗ ${label} failed after ${elapsedS}s:`,
            err instanceof Error ? err.message : err,
          );
          hadFailure = true;
        }
      }
    }
  } finally {
    await resetStage();
  }

  if (hadFailure) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
