import { mkdirSync, copyFileSync, rmSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { registerEngine } from '@signal-studio/render-core/engine';
// timeline.v1 (zod) — a strict superset of every field this file and its
// compositions actually read (contentId/aspectRatio/scenes/watermark/
// template/caseMeta all carry over from the old @signal-studio/types
// version, which this replaces per P2.1: "compositions read only
// timeline.v1"), plus the fields P1.1/P2.1 added specifically for
// clips-overlay (playbackRate, overlay, voStartSec, trimInSec, sourceMuted,
// music.gainDb, cta, watermark.position 'top-left').
import type { TimelineT as Timeline } from '@signal-studio/core/schemas';

const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');

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
    stageFonts(stagingDir);

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
  if (timeline.template === 'case-file')
    return timeline.aspectRatio === '9:16' ? 'CaseFileVertical' : 'CaseFile';
  if (timeline.template === 'clips-overlay') return 'ClipsOverlay';
  if (timeline.template === 'compilation') return 'Compilation';
  if (timeline.template === 'news-card') return 'NewsCard';
  // No silent NewsCard fallback (P2.1) — an unrecognised template is a real
  // bug (a manifest/compile() producing a template this file doesn't know
  // about yet), not something to paper over by rendering the wrong content.
  throw new Error(
    `No Remotion composition registered for timeline.template "${timeline.template}"`,
  );
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
  if (timeline.music?.path && !isRemoteUrl(timeline.music.path)) stage(timeline.music.path);

  return refs;
}

// Fonts aren't referenced by path in any Timeline field (they're a
// composition-internal concern, loaded via loadFont()+staticFile() inside
// FactOverlay/EndCard) — copied unconditionally into every render's staging
// dir, unlike stageLocalAssets' per-timeline asset refs, under a fixed
// `fonts/` subpath so staticFile('fonts/<name>') always resolves.
function stageFonts(stagingDir: string): void {
  const fontsOut = join(stagingDir, 'fonts');
  mkdirSync(fontsOut, { recursive: true });
  for (const name of readdirSync(FONTS_DIR)) {
    copyFileSync(join(FONTS_DIR, name), join(fontsOut, name));
  }
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

  if (timeline.template === 'clips-overlay') {
    return {
      scenes: timeline.scenes.map((scene) => ({
        id: scene.id,
        durationSecs: scene.durationSecs,
        clipUrl: toAssetRef(scene.source?.localPath, assetRefs),
        trimInSec: scene.trimInSec,
        playbackRate: scene.playbackRate,
        sourceMuted: scene.sourceMuted,
        overlay: scene.overlay,
        narrationUrl: scene.narrationPath ? toAssetRef(scene.narrationPath, assetRefs) : undefined,
        voStartSec: scene.voStartSec,
      })),
      musicUrl: timeline.music ? toAssetRef(timeline.music.path, assetRefs) : undefined,
      musicGainDb: timeline.music?.gainDb ?? -18,
      musicDuck: timeline.music?.duckUnderVoice ?? true,
      musicFadeOutSecs: timeline.music?.fadeOutSecs ?? 1.5,
      cta: timeline.cta,
      watermarkText: timeline.watermark?.text,
    };
  }

  if (timeline.template === 'compilation') {
    return {
      scenes: timeline.scenes.map((scene) => ({
        id: scene.id,
        sceneType: scene.sceneType,
        durationSecs: scene.durationSecs,
        captionText: scene.captionText,
        clipUrl: scene.source?.localPath
          ? toAssetRef(scene.source.localPath, assetRefs)
          : undefined,
        trimInSec: scene.trimInSec,
        playbackRate: scene.playbackRate,
        sourceMuted: scene.sourceMuted,
        overlay: scene.overlay,
        narrationUrl: scene.narrationPath ? toAssetRef(scene.narrationPath, assetRefs) : undefined,
        voStartSec: scene.voStartSec,
      })),
      musicUrl: timeline.music ? toAssetRef(timeline.music.path, assetRefs) : undefined,
      musicGainDb: timeline.music?.gainDb ?? -18,
      musicDuck: timeline.music?.duckUnderVoice ?? true,
      musicFadeOutSecs: timeline.music?.fadeOutSecs ?? 1.5,
      cta: timeline.cta,
      watermarkText: timeline.watermark?.text,
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
