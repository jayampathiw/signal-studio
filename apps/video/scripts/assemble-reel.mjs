// Stitch the 3 scene clips of a 21s Wild Eye reel into one MP4, upload to R2,
// and write rendered_video_url to the DB.
//
// Usage (manual):  node apps/video/scripts/assemble-reel.mjs --id <content_item_id>
// Usage (pipeline): called by wild-eye-reel skill Step 6 for 21s format.
//
// Requires: ffmpeg on PATH, R2_* env vars, Supabase service role.

import { createWriteStream, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { parseArgs } from 'util';

import { getServiceClient } from '@signal-studio/database';
import { uploadToR2 } from '@signal-studio/media/storage';
import { concatClips } from '@signal-studio/render-ffmpeg';

const { values } = parseArgs({
  options: { id: { type: 'string' } },
  strict: false,
});

if (!values.id) {
  console.error(JSON.stringify({ error: 'missing-args', message: '--id is required' }));
  process.exit(2);
}

const contentId = Number(values.id);
const db = getServiceClient();

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function main() {
  const { data: item, error } = await db
    .from('content_items')
    .select('id, format, scenes, channel_key')
    .eq('id', contentId)
    .single();
  if (error) throw new Error(`DB fetch failed: ${error.message}`);

  if (item.format !== '21s') {
    throw new Error(`assemble-reel is only for 21s (got format="${item.format}")`);
  }

  const scenes = item.scenes;
  if (!scenes || scenes.length !== 3) {
    throw new Error(`Expected 3 scenes, got ${scenes?.length ?? 0}`);
  }

  const clipUrls = scenes.map((s, i) => {
    if (!s.clip_url) throw new Error(`Scene ${i} has no clip_url — run generation first`);
    return s.clip_url;
  });

  const workDir = join(tmpdir(), `signal-studio-assembly-${contentId}`);
  mkdirSync(workDir, { recursive: true });

  try {
    console.log(`Downloading ${clipUrls.length} clips…`);
    const localPaths = [];
    for (let i = 0; i < clipUrls.length; i++) {
      const dest = join(workDir, `scene_${i}.mp4`);
      await downloadFile(clipUrls[i], dest);
      localPaths.push(dest);
      console.log(`  scene ${i} → ${dest}`);
    }

    const outputPath = join(workDir, `assembled_${contentId}.mp4`);
    console.log('Concatenating via FFmpeg…');
    await concatClips(localPaths, outputPath);

    const r2Key = `wild-capture/assembled/${contentId}_21s.mp4`;
    console.log(`Uploading to R2 as ${r2Key}…`);
    const publicUrl = await uploadToR2(outputPath, { key: r2Key });

    const { error: updErr } = await db
      .from('content_items')
      .update({ rendered_video_url: publicUrl })
      .eq('id', contentId);
    if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

    console.log(JSON.stringify({ id: contentId, rendered_video_url: publicUrl }));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: 'assembly-failed', message: e.message }));
  process.exit(1);
});
