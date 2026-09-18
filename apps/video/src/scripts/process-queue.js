// Polls render_queue for queued jobs and runs the full ingest → render pipeline for each.
//
// Usage:
//   node apps/video/src/scripts/process-queue.js          # process all queued jobs
//   node apps/video/src/scripts/process-queue.js --watch  # poll every 30s until interrupted

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getClient } from '@signal-studio/database';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INGEST = resolve(__dirname, 'ingest.js');
const GENERATE = resolve(__dirname, 'generate-reel.js');

function runScript(scriptPath, args) {
  return new Promise((res, rej) => {
    let stdout = '';
    const p = spawn('node', [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (d) => {
      process.stdout.write(d);
      stdout += d.toString();
    });
    p.on('close', (code) =>
      code === 0 ? res(stdout) : rej(new Error(`${scriptPath} exited ${code}`)),
    );
  });
}

function extractContentItemId(output) {
  const m = output.match(/\[ingest\] created content_item id=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function processJob(job) {
  const { id, channel_key } = job;
  const supabase = getClient();
  console.log(`\n[queue] Job #${id}: ${channel_key}`);

  await supabase
    .from('render_queue')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', id);

  try {
    const ingestOut = await runScript(INGEST, [channel_key]);
    const contentItemId = extractContentItemId(ingestOut);
    if (!contentItemId) throw new Error('Could not find content_item id in ingest output');

    await runScript(GENERATE, [String(contentItemId)]);

    await supabase
      .from('render_queue')
      .update({ status: 'done', done_at: new Date().toISOString() })
      .eq('id', id);
    console.log(`[queue] Job #${id} done → content_item ${contentItemId}`);
  } catch (err) {
    console.error(`[queue] Job #${id} failed:`, err.message);
    await supabase
      .from('render_queue')
      .update({
        status: 'failed',
        error: err.message,
        done_at: new Date().toISOString(),
      })
      .eq('id', id);
  }
}

async function runOnce() {
  const supabase = getClient();
  const { data: jobs, error } = await supabase
    .from('render_queue')
    .select('*')
    .eq('status', 'queued')
    .order('queued_at', { ascending: true });

  if (error) throw error;
  if (!jobs?.length) {
    console.log('[queue] No queued jobs.');
    return 0;
  }

  console.log(`[queue] ${jobs.length} job(s) queued`);
  for (const job of jobs) await processJob(job);
  return jobs.length;
}

const watch = process.argv.includes('--watch');

if (watch) {
  console.log('[queue] Watch mode — polling every 30s. Ctrl+C to stop.');
  const tick = async () => {
    try {
      await runOnce();
    } catch (e) {
      console.error('[queue]', e.message);
    }
  };
  await tick();
  setInterval(tick, 30_000);
} else {
  await runOnce().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
