// CLI: publish a rendered content_item to all enabled platforms on its channel.
//
// Usage: node apps/video/src/scripts/publish.js <id> [<id> ...]

import { getChannel } from '../config/channels.js';
import { getContentItem, updateContentItem } from '@signal-studio/database/content-items';
import { publishToAll } from '../publishers/index.js';
import { platformStatusCols } from '../utils/content-item.js';

async function processOne(id) {
  console.log(`\n══ publish content_item ${id} ══`);
  const item = await getContentItem(id);
  if (item.status !== 'rendered' && item.status !== 'failed') {
    if (!item.rendered_video_url) {
      throw new Error(`content_item ${id} has no rendered_video_url (status=${item.status}). Run generate-reel first.`);
    }
  }

  const channel = getChannel(item.channel_key);
  await updateContentItem(id, { status: 'publishing' });

  const results = await publishToAll(item, channel);

  const patch = {};
  for (const r of results) {
    const cols = platformStatusCols(r.platform);
    if (r.ok) {
      patch[cols.status]   = 'posted';
      patch[cols.postId]   = r.postId;
      patch[cols.postedAt] = r.postedAt;
      patch[cols.error]    = null;
      console.log(`[publish] ${r.platform} ✓ ${r.postId}`);
    } else {
      patch[cols.status] = 'failed';
      patch[cols.error]  = r.error;
      console.error(`[publish] ${r.platform} ✗ ${r.error}`);
    }
  }

  const anyOk  = results.some(r => r.ok);
  const allOk  = results.length > 0 && results.every(r => r.ok);
  patch.status = allOk ? 'posted' : (anyOk ? 'posted' : 'failed');

  await updateContentItem(id, patch);
  return { id, results };
}

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error('Usage: node apps/video/src/scripts/publish.js <id> [<id> ...]');
    process.exit(1);
  }
  for (const id of ids) {
    try {
      await processOne(id);
    } catch (e) {
      console.error(`[publish] FAILED for id=${id}:`, e.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
