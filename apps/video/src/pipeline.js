// Video pipeline orchestrator.
// Ingest scenes → generate narration → render (ffmpeg | remotion) → upload R2 → publish.
// TODO: migrate from reels-pipeline/src/pipeline.js + renderers/

import { channels } from './config/channels.js';
import { render } from '@content-platform/render-core';

// Register engines — each import registers itself via registerEngine()
import '@content-platform/render-ffmpeg';
// import '@content-platform/render-remotion'; // uncomment when Phase 3 begins

async function run() {
  console.log('[video] pipeline starting —', Object.keys(channels).join(', '));

  for (const [id, channel] of Object.entries(channels)) {
    console.log(`[video] processing channel: ${id} (engine=${channel.engine}, mode=${channel.mode})`);
    // TODO: ingest → script → TTS → render → upload → publish
  }

  console.log('[video] pipeline complete');
}

run().catch((err) => {
  console.error('[video] fatal:', err);
  process.exit(1);
});
