import { mkdirSync, copyFileSync, rmSync } from 'fs';
import { join, basename } from 'path';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { registerEngine } from '@signal-studio/render-core/engine';
import type { Timeline } from '@signal-studio/types/timeline';

const isRemoteUrl = (p: string) => /^https?:\/\//i.test(p);

const remotionEngine = {
  name: 'remotion',

  async render(timeline: Timeline, { outputDir }: { outputDir: string }): Promise<string> {
    mkdirSync(outputDir, { recursive: true });

    // Headless Chrome refuses file:// asset loads, so local scene/narration/watermark
    // files must be served by Remotion's bundler static server instead. We stage a
    // *copy* of just the referenced files into a small scratch dir (never the assets'
    // own directory, which could be arbitrarily large/unrelated — e.g. a whole repo
    // root) and point `publicDir` at that. Remote (https) URLs pass through as-is.
    const stagingDir = join(outputDir, `.remotion-assets-${timeline.contentId}`);
    rmSync(stagingDir, { recursive: true, force: true });
    mkdirSync(stagingDir, { recursive: true });
    const assetRefs = stageLocalAssets(timeline, stagingDir);

    try {
      const bundled = await bundle({
        entryPoint: new URL('./index.ts', import.meta.url).pathname,
        publicDir: stagingDir,
      });

      // Map Timeline → Remotion composition props
      // Currently only NewsCard + CaseFile are implemented. Extend this switch as
      // compositions are built.
      const compositionId = resolveComposition(timeline);
      const inputProps = timelineToProps(timeline, assetRefs);
      // inputProps must also go to selectComposition — CaseFile's calculateMetadata
      // (variable episode length) needs the real scenes, not defaultProps, to compute
      // durationInFrames correctly.
      const composition = await selectComposition({
        serveUrl: bundled,
        id: compositionId,
        inputProps,
      });

      const outputPath = join(outputDir, `${timeline.contentId}.mp4`);
      await renderMedia({
        composition,
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: outputPath,
        inputProps,
      });

      return outputPath;
    } finally {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  },
};

registerEngine(remotionEngine);
export default remotionEngine;

function resolveComposition(timeline: Timeline): string {
  // TODO: expand as more compositions are registered in Root.tsx
  if (timeline.template === 'case-file')
    return timeline.aspectRatio === '9:16' ? 'CaseFileVertical' : 'CaseFile';
  return 'NewsCard';
}

// Copies every local (non-http) asset path referenced by the timeline into stagingDir
// under a unique flat filename, and returns a map of original path -> staged filename
// (relative, for staticFile() in the composition).
function stageLocalAssets(timeline: Timeline, stagingDir: string): Map<string, string> {
  const refs = new Map<string, string>();
  let counter = 0;

  const stage = (localPath: string) => {
    if (refs.has(localPath)) return;
    const staged = `${counter++}-${sanitize(basename(localPath))}`;
    copyFileSync(localPath, join(stagingDir, staged));
    refs.set(localPath, staged);
  };

  for (const scene of timeline.scenes) {
    if (scene.source?.localPath && !isRemoteUrl(scene.source.localPath))
      stage(scene.source.localPath);
    if (scene.narrationPath && !isRemoteUrl(scene.narrationPath)) stage(scene.narrationPath);
  }
  if (timeline.watermark?.path && !isRemoteUrl(timeline.watermark.path))
    stage(timeline.watermark.path);

  return refs;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// Resolves a local asset path to its staged relative filename (for staticFile() in
// the composition); remote URLs and empty values pass through unchanged.
function toAssetRef(localPath: string | null | undefined, assetRefs: Map<string, string>): string {
  if (!localPath) return '';
  if (isRemoteUrl(localPath)) return localPath;
  return assetRefs.get(localPath) ?? '';
}

function timelineToProps(
  timeline: Timeline,
  assetRefs: Map<string, string>,
): Record<string, unknown> {
  if (timeline.template === 'case-file') {
    return {
      caseMeta: timeline.caseMeta ?? null,
      watermarkUrl: toAssetRef(timeline.watermark?.path, assetRefs),
      scenes: timeline.scenes.map((scene) => ({
        id: scene.id,
        durationSecs: scene.durationSecs,
        imageUrl: toAssetRef(scene.source?.localPath, assetRefs),
        captionText: scene.captionText ?? '',
        highlights: scene.highlights ?? null,
        zoomFrom: scene.zoomFrom ?? null,
        zoomTo: scene.zoomTo ?? null,
        visual: scene.visual ?? null,
        waveformOverlay: scene.waveformOverlay ?? false,
        words: scene.words ?? null,
        narrationUrl: toAssetRef(scene.narrationPath, assetRefs),
      })),
    };
  }

  const first = timeline.scenes[0];
  return {
    headline: first?.id ?? '',
    source: '',
    imageUrl: toAssetRef(first?.source?.localPath, assetRefs),
    watermarkUrl: toAssetRef(timeline.watermark?.path, assetRefs),
  };
}
