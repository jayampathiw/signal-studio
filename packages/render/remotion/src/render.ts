import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { registerEngine } from '@content-platform/render-core/engine';
import type { Timeline } from '@content-platform/types/timeline';
import { join } from 'path';
import { mkdirSync } from 'fs';

const remotionEngine = {
  name: 'remotion',

  async render(timeline: Timeline, { outputDir }: { outputDir: string }): Promise<string> {
    mkdirSync(outputDir, { recursive: true });

    const bundled = await bundle({ entryPoint: new URL('./Root.tsx', import.meta.url).pathname });

    // Map Timeline → Remotion composition props
    // Currently only NewsCard is implemented. Extend this switch as compositions are built.
    const compositionId = resolveComposition(timeline);
    const composition = await selectComposition({ serveUrl: bundled, id: compositionId });

    const outputPath = join(outputDir, `${timeline.contentId}.mp4`);
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: timelineToProps(timeline),
    });

    return outputPath;
  },
};

registerEngine(remotionEngine);
export default remotionEngine;

function resolveComposition(timeline: Timeline): string {
  // TODO: expand as more compositions are registered in Root.tsx
  return 'NewsCard';
}

function timelineToProps(timeline: Timeline): Record<string, unknown> {
  const first = timeline.scenes[0];
  return {
    headline: first?.id ?? '',
    source: '',
    imageUrl: first?.source?.localPath ?? '',
    watermarkUrl: timeline.watermark?.path ?? '',
  };
}
