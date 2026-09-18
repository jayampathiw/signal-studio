import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3';
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let body: {
    action?: string;
    project_id?: number;
    scene_n?: number;
    cut?: string;
    filename?: string;
    content_type?: string;
    public_url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { action, project_id, scene_n, cut } = body;
  if (!action) return json({ error: 'action required: presign | confirm' }, 400);
  if (!project_id) return json({ error: 'project_id required' }, 400);
  if (scene_n == null) return json({ error: 'scene_n required' }, 400);
  if (!cut) return json({ error: 'cut required (A|B|C|D)' }, 400);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify project exists and is in a valid stills stage
  const { data: project, error: pErr } = await db
    .from('content_items')
    .select('id, status, channel_key')
    .eq('id', project_id)
    .single();

  if (pErr || !project) return json({ error: 'Project not found' }, 404);

  const validStatuses = ['storyboard', 'awaiting_stills', 'awaiting_refs', 'seeding'];
  if (!validStatuses.includes(project.status)) {
    return json(
      {
        error: `Project is "${project.status}" — still uploads only allowed during: ${validStatuses.join(', ')}`,
      },
      409,
    );
  }

  // ── UPLOAD (server-side, avoids browser CORS on R2) ─────────────────────────
  if (action === 'upload') {
    const { filename, content_type, image_base64 } = body as typeof body & {
      image_base64?: string;
    };
    if (!filename) return json({ error: 'filename required' }, 400);
    if (!image_base64) return json({ error: 'image_base64 required' }, 400);

    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const key = `longform/${project_id}/stills/S${String(scene_n).padStart(2, '0')}-${cut}/${Date.now()}.${ext}`;
    const bucket = Deno.env.get('R2_BUCKET_RENDERED')!;
    const mime = content_type ?? (ext === 'png' ? 'image/png' : 'image/jpeg');

    const binary = atob(image_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    try {
      await r2Client().send(
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime, Body: bytes }),
      );
    } catch (e: any) {
      return json({ error: `R2 upload failed: ${e.message}` }, 500);
    }

    const public_url = `${Deno.env.get('R2_PUBLIC_BASE_URL')}/${key}`;

    // Upsert content_stills row
    const { data: existing } = await db
      .from('content_stills')
      .select('id, status')
      .eq('project_id', project_id)
      .eq('scene_n', scene_n)
      .eq('cut', cut)
      .maybeSingle();

    if (existing) {
      const updatable = ['pending', 'generating', 'generated', 'failed'];
      if (!updatable.includes(existing.status)) {
        return json({ error: `Still is "${existing.status}" — cannot overwrite` }, 409);
      }
      await db
        .from('content_stills')
        .update({ clip_url: public_url, status: 'generated' })
        .eq('id', existing.id);
      return json({ id: existing.id, clip_url: public_url, status: 'generated' });
    } else {
      const { data: inserted, error: iErr } = await db
        .from('content_stills')
        .insert({
          project_id,
          scene_n,
          cut,
          image_source: 'editor',
          clip_url: public_url,
          status: 'generated',
          motion: 'push',
        })
        .select('id')
        .single();
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ id: inserted.id, clip_url: public_url, status: 'generated' });
    }
  }

  // ── PRESIGN (legacy — kept for reference, not used by dashboard) ─────────────
  if (action === 'presign') {
    const { filename, content_type } = body;
    if (!filename) return json({ error: 'filename required for presign' }, 400);

    const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
    const key = `longform/${project_id}/stills/S${String(scene_n).padStart(2, '0')}-${cut}/${Date.now()}.${ext}`;
    const bucket = Deno.env.get('R2_BUCKET_RENDERED')!;
    const mime = content_type ?? (ext === 'png' ? 'image/png' : 'image/jpeg');

    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mime,
    });

    let upload_url: string;
    try {
      upload_url = await getSignedUrl(r2Client(), cmd, { expiresIn: 300 });
    } catch (e: any) {
      return json({ error: `Failed to generate presigned URL: ${e.message}` }, 500);
    }

    const public_url = `${Deno.env.get('R2_PUBLIC_BASE_URL')}/${key}`;
    return json({ upload_url, public_url, key, expires_in: 300 });
  }

  // ── CONFIRM ─────────────────────────────────────────────────────────────────
  if (action === 'confirm') {
    const { public_url } = body;
    if (!public_url) return json({ error: 'public_url required for confirm' }, 400);

    // Upsert the still row — create if missing, update clip_url + status if exists
    const { data: existing } = await db
      .from('content_stills')
      .select('id, status')
      .eq('project_id', project_id)
      .eq('scene_n', scene_n)
      .eq('cut', cut)
      .maybeSingle();

    if (existing) {
      // Only update if not already passed/blocked by a gate
      const updatable = ['pending', 'generating', 'generated', 'failed'];
      if (!updatable.includes(existing.status)) {
        return json({ error: `Still is "${existing.status}" — cannot overwrite` }, 409);
      }
      const { error: uErr } = await db
        .from('content_stills')
        .update({ clip_url: public_url, status: 'generated' })
        .eq('id', existing.id);
      if (uErr) return json({ error: uErr.message }, 500);
      return json({ id: existing.id, clip_url: public_url, status: 'generated' });
    } else {
      // Row doesn't exist yet — create it (editor-uploaded still)
      const { data: inserted, error: iErr } = await db
        .from('content_stills')
        .insert({
          project_id,
          scene_n,
          cut,
          image_source: 'editor',
          clip_url: public_url,
          status: 'generated',
          motion: 'push',
        })
        .select('id')
        .single();
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ id: inserted.id, clip_url: public_url, status: 'generated' });
    }
  }

  return json({ error: `Unknown action "${action}". Valid: presign | confirm` }, 400);
});
