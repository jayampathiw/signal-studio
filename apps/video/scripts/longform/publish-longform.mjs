#!/usr/bin/env node
/**
 * publish-longform.mjs — Stage: publish
 *
 * Currently runs in manual-publish mode: prints the video URL + SEO package
 * and marks the project as posted. YouTube automation (F8) is pending.
 *
 * Usage:
 *   node apps/video/scripts/longform/publish-longform.mjs --project <id>
 */

import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: { project: { type: 'string' } },
  strict: false,
});

const projectId = Number(values.project);
if (!projectId) { console.error('--project <id> required'); process.exit(1); }

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY,
);

const { data: row, error } = await db
  .from('content_items')
  .select('id, title, channel_key, status, rendered_video_url, seo')
  .eq('id', projectId)
  .single();

if (error || !row) {
  console.error('Failed to load project:', error?.message ?? 'not found');
  process.exit(1);
}

if (row.status !== 'publishing') {
  console.error(`Expected status=publishing, got "${row.status}" — aborting`);
  process.exit(1);
}

if (!row.rendered_video_url) {
  console.error('rendered_video_url is NULL — cannot publish without a video file');
  await db.from('content_items')
    .update({ status: 'failed', status_note: 'publish failed: rendered_video_url is NULL' })
    .eq('id', projectId);
  process.exit(1);
}

// ── Print publish package ────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log(`PUBLISH PACKAGE — Project #${row.id}`);
console.log('══════════════════════════════════════════════════════');
console.log(`Channel : ${row.channel_key}`);
console.log(`Title   : ${row.title ?? '(no title)'}`);
console.log(`Video   : ${row.rendered_video_url}`);

if (row.seo) {
  console.log('\n── SEO ──────────────────────────────────────────────');
  console.log(`Title      : ${row.seo.title ?? ''}`);
  console.log(`Description:\n${row.seo.description ?? ''}`);
  if (row.seo.hashtags?.length) {
    console.log(`Hashtags   : ${row.seo.hashtags.map(h => `#${h}`).join(' ')}`);
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('NOTE: YouTube automation (F8) is pending.');
console.log('Upload the video manually using the URL above,');
console.log('then the project will be marked as posted.');
console.log('══════════════════════════════════════════════════════\n');

// ── Mark posted ──────────────────────────────────────────────────────────────
const note = `manual-publish — video: ${row.rendered_video_url}`;
const { error: updateErr } = await db
  .from('content_items')
  .update({ status: 'posted', status_note: note })
  .eq('id', projectId);

if (updateErr) {
  console.error('Failed to mark as posted:', updateErr.message);
  process.exit(1);
}

console.log(`✓ Project #${projectId} marked as posted.`);
console.log(`  status_note: ${note}`);
