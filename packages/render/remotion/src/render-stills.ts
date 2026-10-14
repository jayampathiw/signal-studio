import { mkdirSync, copyFileSync, rmSync, readdirSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import type { CarouselOutputT as CarouselOutput } from '@signal-studio/core/schemas';

// Same font set `render.ts`'s `stageFonts()` copies in — Root.tsx registers
// every composition (CaseFile, ClipsOverlay, Compilation, ...) up front, and
// several of them load this font eagerly at mount regardless of which
// composition is actually being rendered. Real bug found running this for
// real (P3.3, 2026-09-24): omitting this staging step made every carousel
// render fail with a 404 on Inter-ExtraBold.ttf, thrown by an unrelated
// composition (EndCard/FactOverlay/TitlePlate) sharing the same bundle.
const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');

function stageFonts(stagingDir: string): void {
  const fontsOut = join(stagingDir, 'fonts');
  mkdirSync(fontsOut, { recursive: true });
  for (const name of readdirSync(FONTS_DIR)) {
    copyFileSync(join(FONTS_DIR, name), join(fontsOut, name));
  }
}

/**
 * P3.3 — renders a `carousel` template's output as N independent still
 * PNGs, ported from `apps/video/scripts/policy-file/render-carousel.mjs`'s
 * own `bundle()`/`selectComposition()`/`renderStill()` loop.
 *
 * **Deliberately NOT registered on the `render-core` engine registry** —
 * `RenderEngine.render()`'s contract is `(timeline) => Promise<string>` (one
 * video path), which doesn't fit "N stills, no Timeline at all." Rather than
 * stretching that interface to cover a fundamentally different output shape
 * for one template, this is its own small, explicitly-scoped export;
 * whoever wires a real `carousel` job (P3.5's own publish-stage wiring gap
 * applies equally here — not done this pass) calls this directly instead of
 * going through `render()`.
 */
export async function renderCarouselStills(
  output: CarouselOutput,
  opts: { outputDir: string; watermarkPath?: string },
): Promise<string[]> {
  mkdirSync(opts.outputDir, { recursive: true });

  const stagingDir = join(opts.outputDir, `.remotion-assets-${output.contentId}`);
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  stageFonts(stagingDir);

  let watermarkStaged: string | undefined;
  const watermarkPath = opts.watermarkPath ?? output.watermarkPath;
  if (watermarkPath) {
    watermarkStaged = basename(watermarkPath);
    copyFileSync(watermarkPath, join(stagingDir, watermarkStaged));
  }

  try {
    const bundled = await bundle({
      entryPoint: new URL('./index.ts', import.meta.url).pathname,
      publicDir: stagingDir,
    });

    const outPaths: string[] = [];
    const totalSlides = output.slides.length;
    for (let i = 0; i < totalSlides; i++) {
      const slide = output.slides[i];
      const inputProps = {
        slideNumber: i + 1,
        totalSlides,
        headline: slide.headline,
        body: slide.body ?? '',
        watermarkUrl: watermarkStaged,
        showFolder: slide.showFolder,
      };

      const composition = await selectComposition({
        serveUrl: bundled,
        id: 'CarouselSlide',
        inputProps,
      });
      const outPath = join(opts.outputDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
      await renderStill({
        composition,
        serveUrl: bundled,
        output: outPath,
        inputProps,
        overwrite: true,
      });
      outPaths.push(outPath);
    }

    return outPaths;
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
}
