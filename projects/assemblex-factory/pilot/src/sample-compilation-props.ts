import type { CompilationProps } from './props';
import { sampleProps } from './sample-props';

// Minimal single-episode compilation for `npm run studio` / composition
// registration validity — the real multi-episode test lives in
// content/2026-W38/series_test/ (P0.8-07), used by render-compilation.ts.
export const sampleCompilationProps: CompilationProps = {
  episodes: [{ title: sampleProps.endCard.subject, shots: sampleProps.shots }],
  musicUrl: sampleProps.musicUrl,
  musicGainDb: sampleProps.musicGainDb,
  musicDuck: sampleProps.musicDuck,
  endCard: sampleProps.endCard,
  watermarkText: sampleProps.watermarkText,
};
