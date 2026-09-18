// The Policy File — static image-carousel renderer (Facebook/Instagram feed, 4:5).
// Separate from assemble-case.mjs: a carousel is N independent still PNGs, not a
// video timeline — no narration, no audio, no Sequence/duration math, so reusing the
// video pipeline (Timeline/CaseFile) would be forcing a video-shaped tool onto a
// fundamentally different output. Renders each slide via Remotion's renderStill()
// against the CarouselSlide composition.
//
// Reads content/policy-file/<case-slug>/carousel.json:
//   { "caseId", "channelKey"?, "slides": [{ "headline", "body"?, "showFolder"? }] }
//
// Usage (--experimental-strip-types required, same reason as assemble-case.mjs):
//   node --experimental-strip-types apps/video/scripts/policy-file/render-carousel.mjs --dir content/policy-file/<case-slug>

import { existsSync, mkdirSync, copyFileSync, rmSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';

import { getChannel } from '../../src/config/channels.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const DEFAULT_CHANNEL_KEY = 'policy-file/case-file/EN';

const { values } = parseArgs({
  options: { dir: { type: 'string' } },
  strict: false,
});

if (!values.dir) {
  console.error('--dir <project-dir> required, e.g. content/policy-file/appeal-playbook-7-days');
  process.exit(2);
}

const projectDir = resolve(REPO_ROOT, values.dir);
const carouselPath = join(projectDir, 'carousel.json');
const outputDir = join(projectDir, 'output');

if (!existsSync(carouselPath)) {
  console.error(`carousel.json not found at ${carouselPath}`);
  process.exit(1);
}

const data = JSON.parse(await readFile(carouselPath, 'utf-8'));
const channel = getChannel(data.channelKey ?? DEFAULT_CHANNEL_KEY);
mkdirSync(outputDir, { recursive: true });

// Same reasoning as render.ts: headless Chrome can't load file:// assets, so stage a
// copy of just the watermark (never the asset's own directory) and serve it as
// publicDir.
const watermarkPath = resolve(REPO_ROOT, 'assets/logos', channel.watermarkFile);
const stagingDir = join(outputDir, '.remotion-assets');
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
const watermarkStaged = basename(watermarkPath);
copyFileSync(watermarkPath, join(stagingDir, watermarkStaged));

try {
  const bundled = await bundle({
    entryPoint: resolve(REPO_ROOT, 'packages/render/remotion/src/index.ts'),
    publicDir: stagingDir,
  });

  const totalSlides = data.slides.length;
  for (let i = 0; i < totalSlides; i++) {
    const slide = data.slides[i];
    const inputProps = {
      slideNumber: i + 1,
      totalSlides,
      headline: slide.headline,
      body: slide.body ?? '',
      watermarkUrl: watermarkStaged,
      showFolder: slide.showFolder ?? false,
    };

    const composition = await selectComposition({
      serveUrl: bundled,
      id: 'CarouselSlide',
      inputProps,
    });
    const outPath = join(outputDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
    await renderStill({
      composition,
      serveUrl: bundled,
      output: outPath,
      inputProps,
      overwrite: true,
    });
    console.log(`Rendered ${outPath}`);
  }

  console.log(`Done: ${totalSlides} slides in ${outputDir}`);
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
