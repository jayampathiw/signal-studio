// Phase H2 — Still-image generation (docs/long-form-hybrid-plan.md §4 Phase H2).
// Routes each still row to the correct provider: reference-reuse (free),
// Soul V2 / nano_banana_2 (Higgsfield), or google (skipped — H3 workflow).
// Resumable: only 'pending' rows are processed; re-run skips 'generated'/'passed'.
//
// Usage:
//   node apps/video/scripts/longform/generate-stills.mjs --project 29 [--dry] [--limit N] [--source reference|higgsfield|google]

import { parseArgs } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getServiceClient } from '@signal-studio/database';
import { runPool } from '../../src/longform/pool.js';
import { generateStill, generatePrecisionStill } from '../../src/longform/soul.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    dry:     { type: 'boolean', default: false },
    limit:   { type: 'string', default: '4' },
    source:  { type: 'string' }, // optional: reference | higgsfield | google
  },
  strict: false,
});

if (!values.project) { console.error('Error: --project <id> required'); process.exit(2); }

const projectId = Number(values.project);
const dry       = values.dry;
const limit     = Number(values.limit);
const sourceFilter = values.source ?? null;
const db = getServiceClient();

// R2 client (lazy-init — avoids env errors on --dry)
let _r2 = null;
function getR2() {
  if (!_r2) {
    _r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId:     process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _r2;
}

async function uploadBuffer(buffer, key, contentType = 'image/png') {
  const bucket = process.env.R2_BUCKET_RENDERED;
  await getR2().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  // Load all reference rows for this project (url = R2, higgsfield_media_id for API calls)
  const { data: allRefs, error: rErr } = await db
    .from('content_references').select('key, url, higgsfield_media_id').eq('project_id', projectId);
  if (rErr) throw new Error(rErr.message);
  const refByKey = Object.fromEntries((allRefs ?? []).map((r) => [r.key, r]));

  // Load pending still rows
  let q = db.from('content_clips')
    .select('id, scene_n, image_source, visual_prompt, reference_keys, status, retry_count')
    .eq('project_id', projectId)
    .eq('kind', 'still')
    .eq('status', 'pending')
    .order('scene_n');
  if (sourceFilter) q = q.eq('image_source', sourceFilter);
  const { data: stills, error: sErr } = await q;
  if (sErr) throw new Error(sErr.message);
  if (!stills?.length) { console.error('No pending still rows to process.'); return; }

  console.error(`${dry ? '[dry] ' : ''}Processing ${stills.length} still(s), limit=${limit}…`);

  const counts = { generated: 0, skipped: 0, errored: 0 };

  await runPool(stills, async (clip) => {
    const src = clip.image_source;
    const refs = (clip.reference_keys ?? []).map((k) => refByKey[k]).filter(Boolean);

    // --- google: skip ---
    if (src === 'google') {
      console.error(`[skip] S${String(clip.scene_n).padStart(2, '0')} google — waiting for H3 workflow`);
      counts.skipped++;
      return;
    }

    // --- reference: copy R2 URL of first ref directly ---
    if (src === 'reference') {
      const ref = refs[0];
      if (!ref?.url) throw new Error(`S${clip.scene_n}: reference route but no ref URL found (keys: ${clip.reference_keys})`);
      if (dry) {
        console.error(`[dry][ref] S${String(clip.scene_n).padStart(2, '0')} → ${ref.url}`);
        counts.generated++;
        return;
      }
      await db.from('content_clips').update({ clip_url: ref.url, status: 'generated' }).eq('id', clip.id);
      console.error(`[ref] S${String(clip.scene_n).padStart(2, '0')} → ${ref.url}`);
      counts.generated++;
      return;
    }

    // --- higgsfield: Soul V2 (0–1 refs) or nano_banana_2 (2+ refs) ---
    if (src === 'higgsfield') {
      if (dry) {
        const model = refs.length >= 2 ? 'nano_banana_2' : 'soul_v2';
        console.error(`[dry][${model}] S${String(clip.scene_n).padStart(2, '0')} — ${refs.length} ref(s): ${refs.map((r) => r.key).join(', ') || 'none'}`);
        counts.generated++;
        return;
      }

      let result;
      const maxRetry = 3;
      for (let attempt = (clip.retry_count ?? 0) + 1; attempt <= maxRetry; attempt++) {
        try {
          if (refs.length >= 2) {
            result = await generatePrecisionStill({
              prompt: clip.visual_prompt,
              referenceMediaIds: refs.map((r) => r.higgsfield_media_id).filter(Boolean),
            });
          } else {
            result = await generateStill({
              prompt: clip.visual_prompt,
              referenceMediaId: refs[0]?.higgsfield_media_id,
            });
          }
          break;
        } catch (err) {
          const terminal = attempt >= maxRetry;
          await db.from('content_clips').update({
            status: terminal ? 'blocked' : 'failed',
            retry_count: attempt,
            fail_reason: err.message.slice(0, 400),
          }).eq('id', clip.id);
          if (terminal) { counts.errored++; return; }
        }
      }

      // Download + upload to R2
      const r2Key = `longform/${projectId}/stills/S${clip.scene_n}.png`;
      const buf = await downloadBuffer(result.url);
      const r2Url = await uploadBuffer(buf, r2Key, 'image/png');

      await db.from('content_clips').update({
        clip_url: r2Url,
        status: 'generated',
        fail_reason: null,
      }).eq('id', clip.id);

      console.error(`[done] S${String(clip.scene_n).padStart(2, '0')} → ${r2Url}`);
      counts.generated++;
      return;
    }

    console.error(`[skip] S${String(clip.scene_n).padStart(2, '0')} unknown source "${src}"`);
    counts.skipped++;
  }, { limit });

  console.error(`\n${dry ? '[dry] ' : ''}generated ${counts.generated}, skipped ${counts.skipped} (google), errored ${counts.errored}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
