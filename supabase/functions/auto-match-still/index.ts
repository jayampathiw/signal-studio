import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3';
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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let project_id: number;
  let image_base64: string;
  let mime_type: string;
  let filename: string;

  try {
    const body = await req.json();
    project_id = Number(body.project_id);
    image_base64 = String(body.image_base64 ?? '');
    mime_type = String(body.mime_type ?? 'image/jpeg');
    filename = String(body.filename ?? 'image.jpg');
    if (!project_id || !image_base64) throw new Error('project_id and image_base64 required');
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  // Verify project is in a stills-upload stage
  const { data: project, error: pErr } = await supabase
    .from('content_items')
    .select('id, status')
    .eq('id', project_id)
    .single();
  if (pErr || !project) return json({ error: 'Project not found' }, 404);

  const validStatuses = ['storyboard', 'awaiting_stills', 'awaiting_refs', 'seeding'];
  if (!validStatuses.includes(project.status)) {
    return json({ error: `Project status "${project.status}" does not allow still uploads` }, 409);
  }

  // Fetch all prompts for this project (generated stills only, not editor builds)
  const { data: stills, error: sErr } = await supabase
    .from('content_stills')
    .select('scene_n, cut, prompt, image_source')
    .eq('project_id', project_id)
    .neq('image_source', 'editor')
    .not('prompt', 'is', null)
    .order('scene_n')
    .order('cut');

  if (sErr) return json({ error: sErr.message }, 500);
  if (!stills?.length) return json({ error: 'No matchable stills found for this project' }, 404);

  // Build slot list for Claude
  const slotList = stills
    .map((s) => `S${s.scene_n}-${s.cut}: ${(s.prompt as string).slice(0, 200)}`)
    .join('\n');

  // Call Claude Vision
  const anthropicOpts: { apiKey: string; baseURL?: string } = {
    apiKey: Deno.env.get('ANTHROPIC_KEY')!,
  };
  const baseURL = Deno.env.get('ANTHROPIC_BASE_URL');
  if (baseURL) anthropicOpts.baseURL = baseURL;
  const anthropic = new Anthropic(anthropicOpts);
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';

  let matchedSlot: string;
  try {
    const res = await anthropic.messages.create({
      model,
      max_tokens: 15,
      system:
        'You are a slot-matching engine. Output ONLY a slot ID like "S7-A" or the word "NO_MATCH". Never describe images. Never explain. No punctuation. No other words.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mime_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: image_base64,
              },
            },
            {
              type: 'text',
              text: `Which slot does this image match? Output only the slot ID or NO_MATCH.\n\n${slotList}`,
            },
          ],
        },
      ],
    });
    matchedSlot = ((res.content[0] as { text: string }).text ?? '').trim();
  } catch (e: any) {
    return json({ error: `Claude Vision error: ${e.message}` }, 500);
  }

  // Check for explicit no-match or descriptions (Claude ignoring instruction)
  if (matchedSlot.toUpperCase().startsWith('NO_MATCH') || matchedSlot === '') {
    return json({ error: 'NO_MATCH: image does not correspond to any scene slot' }, 422);
  }

  // Extract slot ID — works even if Claude added a word or punctuation
  const slotM = matchedSlot.match(/S(\d+)-([A-D])/i);
  if (!slotM) return json({ error: `NO_MATCH: Claude could not identify a slot` }, 422);

  const scene_n = Number(slotM[1]);
  const cut = slotM[2].toUpperCase();
  const slot = `S${scene_n}-${cut}`;

  // Verify slot exists in DB
  const slotExists = stills.some((s) => s.scene_n === scene_n && s.cut === cut);
  if (!slotExists)
    return json({ error: `Matched slot S${scene_n}-${cut} not found in project stills` }, 422);

  // Upload image bytes to R2
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const key = `longform/${project_id}/stills/S${String(scene_n).padStart(2, '0')}-${cut}/${Date.now()}.${ext}`;
  const bucket = Deno.env.get('R2_BUCKET_RENDERED')!;

  try {
    const bytes = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));
    await r2Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: mime_type,
      }),
    );
  } catch (e: any) {
    return json({ error: `R2 upload failed: ${e.message}` }, 500);
  }

  const public_url = `${Deno.env.get('R2_PUBLIC_BASE_URL')}/${key}`;

  // Update the content_stills row — skip if slot already has an image
  const { data: existing } = await supabase
    .from('content_stills')
    .select('id, status, clip_url')
    .eq('project_id', project_id)
    .eq('scene_n', scene_n)
    .eq('cut', cut)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: number; status: string; clip_url: string | null };
    if (row.clip_url) {
      return json({ error: `ALREADY_FILLED: slot ${slot} already has an image — skipped` }, 409);
    }
    const updatable = ['pending', 'generating', 'generated', 'failed'];
    if (!updatable.includes(row.status)) {
      return json({ error: `Slot ${slot} is "${row.status}" — cannot overwrite` }, 409);
    }
    await supabase
      .from('content_stills')
      .update({ clip_url: public_url, status: 'generated' })
      .eq('id', row.id);
  }

  return json({ ok: true, slot, scene_n, cut, clip_url: public_url });
});
