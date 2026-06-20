// News pipeline orchestrator.
// TODO: migrate from facebook-news-pipeline/src/pipeline.js

import { SOURCES } from './config/sources.js';

async function run() {
  console.log('[news] pipeline starting —', Object.keys(SOURCES).join(', '));

  for (const [country, config] of Object.entries(SOURCES)) {
    console.log(`[news] processing ${country}…`);
    // TODO: ingest → deduplicate → score → validate → upsert → generate captions → post
  }

  console.log('[news] pipeline complete');
}

run().catch((err) => {
  console.error('[news] fatal:', err);
  process.exit(1);
});
