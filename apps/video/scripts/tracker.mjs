// Log performance data for a posted Wild Eye reel.
// Writes to content_items.metrics (jsonb) and appends to data/reels.csv.
//
// Usage:
//   node apps/video/scripts/tracker.mjs \
//     --id 42 --views 8200 [--watch-pct 47.3] [--follows 11] \
//     [--distribution organic|boosted|mixed] [--fb-multiplier 0.5]
//
// Also invoked by the /log-reel slash command.

import { existsSync, appendFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, '../../../data/reels.csv');
const CSV_HEADER =
  'id,title,format,slot,posted_at,views,watch_through_pct,follows,follows_per_1k,distribution,fb_multiplier\n';

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    views: { type: 'string' },
    'watch-pct': { type: 'string' },
    follows: { type: 'string' },
    distribution: { type: 'string' },
    'fb-multiplier': { type: 'string' },
  },
  strict: false,
});

if (!values.id || !values.views) {
  console.error(
    JSON.stringify({ error: 'missing-args', message: '--id and --views are required' }),
  );
  process.exit(2);
}

const id = Number(values.id);
const views = Number(values.views);
const watchPct = values['watch-pct'] != null ? Number(values['watch-pct']) : null;
const follows = values.follows != null ? Number(values.follows) : null;
const distribution = values.distribution ?? 'organic';
const fbMultiplier = values['fb-multiplier'] != null ? Number(values['fb-multiplier']) : null;

if (!['organic', 'boosted', 'mixed'].includes(distribution)) {
  console.error(
    JSON.stringify({
      error: 'invalid-distribution',
      message: 'distribution must be: organic | boosted | mixed',
    }),
  );
  process.exit(2);
}

const db = getServiceClient();

const { data: item, error: fetchErr } = await db
  .from('content_items')
  .select('id, title, format, slot, status, fb_posted_at')
  .eq('id', id)
  .single();

if (fetchErr) {
  console.error(JSON.stringify({ error: 'db-fetch', message: fetchErr.message }));
  process.exit(1);
}

const metrics = {
  logged_at: new Date().toISOString(),
  views,
  distribution,
  ...(watchPct != null && { watch_through_pct: watchPct }),
  ...(follows != null && { follows_gained: follows }),
  ...(fbMultiplier != null && { fb_distribution_multiplier: fbMultiplier }),
};

const { error: updErr } = await db.from('content_items').update({ metrics }).eq('id', id);

if (updErr) {
  console.error(JSON.stringify({ error: 'db-update', message: updErr.message }));
  process.exit(1);
}

// Append to CSV
const followsPer1k = follows != null && views > 0 ? ((follows / views) * 1000).toFixed(2) : '';
const postedAt = item.fb_posted_at ? item.fb_posted_at.slice(0, 10) : '';
const csvRow =
  [
    id,
    `"${(item.title ?? '').replace(/"/g, '""')}"`,
    item.format ?? '',
    `"${item.slot ?? ''}"`,
    postedAt,
    views,
    watchPct ?? '',
    follows ?? '',
    followsPer1k,
    distribution,
    fbMultiplier ?? '',
  ].join(',') + '\n';

if (!existsSync(CSV_PATH)) {
  writeFileSync(CSV_PATH, CSV_HEADER);
}
appendFileSync(CSV_PATH, csvRow);

const summary = followsPer1k ? `follows/1k: ${followsPer1k}` : '';
console.log(JSON.stringify({ id, status: 'logged', metrics, csv: CSV_PATH, summary }));
console.error(`Logged C-${id}. ${summary}. Distribution: ${distribution}.`);
