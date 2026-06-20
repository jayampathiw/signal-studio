// Video pipeline orchestrator.
// Runs one full cycle: for each enabled channel, ingest clips → generate AI content → render → upload.
// Publish is a separate step (scripts/publish.js) so it can be confirmed before posting.
//
// Usage:
//   node apps/video/src/pipeline.js                     # process all channels
//   node apps/video/src/pipeline.js wildlife/factual/EN # one channel only

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CHANNELS } from './config/channels.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INGEST    = resolve(__dirname, 'scripts/ingest.js');
const GENERATE  = resolve(__dirname, 'scripts/generate-reel.js');

function runScript(scriptPath, args) {
  return new Promise((res, rej) => {
    let stdout = '';
    const p = spawn('node', [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', d => { process.stdout.write(d); stdout += d.toString(); });
    p.on('close', code => code === 0 ? res(stdout) : rej(new Error(`${scriptPath} exited ${code}`)));
  });
}

function extractContentItemId(output) {
  const m = output.match(/\[ingest\] created content_item id=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function processChannel(channelKey) {
  console.log(`\n━━━ channel: ${channelKey} ━━━`);
  try {
    const ingestOut = await runScript(INGEST, [channelKey]);
    const id = extractContentItemId(ingestOut);
    if (!id) {
      console.error(`[pipeline] could not find content_item id in ingest output for ${channelKey}`);
      return { channelKey, ok: false };
    }
    await runScript(GENERATE, [String(id)]);
    console.log(`[pipeline] ${channelKey} → content_item ${id} rendered and ready to publish`);
    return { channelKey, id, ok: true };
  } catch (e) {
    console.error(`[pipeline] ${channelKey} FAILED:`, e.message);
    return { channelKey, ok: false, error: e.message };
  }
}

async function main() {
  const targetKeys = process.argv.slice(2);
  const keys = targetKeys.length > 0 ? targetKeys : Object.keys(CHANNELS);

  // Only process channels with at least one enabled platform
  const enabled = keys.filter(k => {
    const ch = CHANNELS[k];
    if (!ch) { console.warn(`[pipeline] unknown channel key: ${k}`); return false; }
    return Object.values(ch.platforms).some(p => p.enabled);
  });

  if (enabled.length === 0) {
    console.log('[pipeline] no enabled channels — nothing to do');
    return;
  }

  console.log(`[pipeline] processing ${enabled.length} channel(s): ${enabled.join(', ')}`);
  const results = [];
  for (const key of enabled) results.push(await processChannel(key));

  const ok    = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n[pipeline] done — ${ok} succeeded, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('[pipeline] fatal:', e); process.exit(1); });
