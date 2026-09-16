// The Policy File — registers an approved, rendered case as a content_items row so
// the existing dashboard "publish" flow can drive it to Facebook. Run this only
// after reviewing the render from assemble-case.mjs.
//
// Writes directly to `ai_caption` (not `seo`) — packages/publishers/facebook.js reads
// ai_caption today; this sidesteps the known seo/ai_caption mismatch bug entirely,
// with zero changes to shared publisher code.
//
// Usage:
//   node apps/video/scripts/policy-file/register-case.mjs --dir content/policy-file/<case-slug>

import { parseArgs } from 'util';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { uploadToR2 } from '@signal-studio/media/storage';
import { insertContentItem } from '@signal-studio/database/content-items';
import { getChannel } from '../../src/config/channels.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const DEFAULT_CHANNEL_KEY = 'policy-file/case-file/EN';

const { values } = parseArgs({
  options: { dir: { type: 'string' } },
  strict: false,
});

if (!values.dir) {
  console.error('--dir <project-dir> required, e.g. content/policy-file/case-001-denied-claim');
  process.exit(2);
}

const projectDir = resolve(REPO_ROOT, values.dir);
const casePath = join(projectDir, 'case.json');
const caseData = JSON.parse(await readFile(casePath, 'utf-8'));
const channelKey = caseData.channelKey ?? DEFAULT_CHANNEL_KEY;
const channel = getChannel(channelKey);

const outputPath = join(projectDir, 'output', `${caseData.caseId}.mp4`);
if (!existsSync(outputPath)) {
  console.error(`No rendered video at ${outputPath} — run assemble-case.mjs first.`);
  process.exit(1);
}

console.log(`Uploading ${outputPath} to R2...`);
const videoUrl = await uploadToR2(outputPath, { key: `policy-file/${caseData.caseId}.mp4` });

const row = await insertContentItem({
  channel_key: channelKey,
  niche: channel.niche,
  style: channel.style,
  language: 'en',
  source_type: 'manual',
  title: caseData.title,
  description: caseData.description,
  ai_caption: {
    intro: caseData.title,
    question: caseData.description,
    cta: caseData.sourceCitation ? `Source: ${caseData.sourceCitation}` : undefined,
  },
  rendered_video_url: videoUrl,
  duration_sec: caseData.scenes.reduce((sum, s) => sum + s.durationSecs, 0) + 5, // + intro/outro cards
  status: 'rendered',
  target_platforms: ['facebook'],
});

console.log(`Registered content_items row ${row.id} for ${caseData.caseId}. Publish from the dashboard when ready.`);
