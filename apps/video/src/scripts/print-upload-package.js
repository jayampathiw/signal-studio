// CLI: print the manual-upload package for one or more rendered content_items.
//
// Outputs the MP4 URL, title, full caption (intro + question + CTA + hashtags),
// and description — everything you need to copy/paste into Facebook's web composer.
//
// Usage:
//   node apps/video/src/scripts/print-upload-package.js <id> [<id> ...]
//
// Flags:
//   --caption-only   Print only the caption block (useful for piping to xclip).
//   --url-only       Print only the MP4 URL.

import { existsSync } from 'fs';
import { resolve } from 'path';

import { getContentItem } from '@signal-studio/database/content-items';

import { getChannel } from '../config/channels.js';

const SEP = '═'.repeat(64);
const THIN = '─'.repeat(64);

function buildCaption(item) {
  const { intro, question, cta } = item.ai_caption || {};
  const tags = (item.hashtags || []).map((h) => '#' + h.replace(/^#/, '')).join(' ');
  return [intro, question, cta, tags].filter(Boolean).join('\n\n');
}

function printFull(item, channel) {
  console.log(SEP);
  console.log(`MANUAL UPLOAD PACKAGE — content_item ${item.id}`);
  console.log(SEP);
  console.log('');

  console.log('▶ CHANNEL');
  console.log(`  ${item.channel_key} (${channel.style} mode, ${channel.contentLanguage})`);
  console.log(`  Destination: ${channel.pageName}`);
  console.log('');

  console.log('▶ MP4 URL');
  if (item.rendered_video_url) {
    console.log(`  ${item.rendered_video_url}`);
  } else if (item.rendered_local_path) {
    console.log(`  (no R2 URL — local file at ${item.rendered_local_path})`);
  } else {
    console.log(
      '  ⚠ NOT RENDERED YET — run: node apps/video/src/scripts/generate-reel.js ' + item.id,
    );
  }
  console.log('');

  const srtPath = resolve('output/reels', `${item.id}.srt`);
  if (existsSync(srtPath)) {
    console.log('▶ CAPTIONS (.srt — upload separately to FB/YT to enable viewer subtitles)');
    console.log(`  ${srtPath}`);
    console.log('');
  }

  console.log('▶ TITLE');
  console.log(`  ${item.title || '(none)'}`);
  console.log('');

  console.log('▶ CAPTION (paste into the FB/IG/YT post body)');
  console.log(THIN);
  console.log(buildCaption(item));
  console.log(THIN);
  console.log('');

  console.log('▶ DESCRIPTION (for SEO; YouTube uses this, FB optional)');
  console.log(`  ${item.description || '(none)'}`);
  console.log('');

  console.log('▶ NARRATION SCRIPT (for reference — already burned into the audio)');
  console.log(THIN);
  console.log(item.narration_script || '(none — silent mode)');
  console.log(THIN);
  console.log('');

  console.log('▶ METADATA');
  console.log(`  Duration:    ${item.duration_sec ?? '?'}s`);
  console.log(`  Rendered:    ${item.rendered_at || '—'}`);
  console.log(`  Status:      ${item.status}`);
  console.log(`  Hashtags:    ${(item.hashtags || []).length} tags`);
  console.log('');
}

async function processOne(id, flags) {
  const item = await getContentItem(id);
  const channel = getChannel(item.channel_key);

  if (flags.urlOnly) {
    if (!item.rendered_video_url) {
      console.error(`content_item ${id}: no rendered_video_url`);
      process.exit(2);
    }
    console.log(item.rendered_video_url);
    return;
  }

  if (flags.captionOnly) {
    console.log(buildCaption(item));
    return;
  }

  printFull(item, channel);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    captionOnly: args.includes('--caption-only'),
    urlOnly: args.includes('--url-only'),
  };
  const ids = args.filter((a) => !a.startsWith('--'));

  if (ids.length === 0) {
    console.error(
      'Usage: node apps/video/src/scripts/print-upload-package.js [--caption-only|--url-only] <id> [<id> ...]',
    );
    process.exit(1);
  }

  for (const id of ids) {
    try {
      await processOne(id, flags);
    } catch (e) {
      console.error(`[print] FAILED for id=${id}:`, e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
