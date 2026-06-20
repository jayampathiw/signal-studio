import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Provider 1 — fal.ai Recraft V3 (primary — best quality, photorealistic)
async function generateViaFal(prompt: string): Promise<Uint8Array> {
  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) throw new Error('FAL_KEY not configured');

  const res = await fetch('https://fal.run/fal-ai/recraft-v3', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: { width: 1080, height: 1920 },
      style: 'realistic_image',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`fal.ai ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const imageUrl: string = data.images?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL in fal.ai response');

  // fal.ai returns a CDN URL — fetch bytes before they expire
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch fal.ai image: ${imgRes.status}`);
  return new Uint8Array(await imgRes.arrayBuffer());
}

// Provider 2 — Cloudflare Workers AI Flux 1 Schnell (fallback, ~20–30 images/day free)
async function generateViaCloudflare(prompt: string): Promise<Uint8Array> {
  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${Deno.env.get('CF_ACCOUNT_ID')}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await fetch(cfUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('CF_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, num_steps: 8, width: 1080, height: 1920 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Cloudflare ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const base64Image: string = data.result?.image;
  if (!base64Image) throw new Error('No image in Cloudflare response');
  return Uint8Array.from(atob(base64Image), (c) => c.charCodeAt(0));
}

// Provider 3 — Google AI Studio Imagen (last resort)
async function generateViaGoogle(prompt: string): Promise<Uint8Array> {
  const googleKey = Deno.env.get('GOOGLE_AI_KEY');
  if (!googleKey) throw new Error('GOOGLE_AI_KEY not configured');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${googleKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '9:16' },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const base64Image: string = data.predictions?.[0]?.bytesBase64Encoded;
  if (!base64Image) throw new Error('No image in Google response');
  return Uint8Array.from(atob(base64Image), (c) => c.charCodeAt(0));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { article_id } = await req.json();
    if (!article_id) return json({ error: 'article_id required' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: article, error: fetchErr } = await supabase
      .from('articles')
      .select('id, image_prompt, country')
      .eq('id', article_id)
      .single();

    if (fetchErr || !article) return json({ error: 'Article not found' }, 404);
    if (!article.image_prompt) return json({ error: 'No image_prompt — generate caption first' }, 400);

    // Try providers in priority order — fal.ai first, Cloudflare second, Google last
    let imageBytes: Uint8Array | null = null;
    let provider = '';
    const errors: string[] = [];

    try {
      imageBytes = await generateViaFal(article.image_prompt);
      provider = 'fal.ai';
    } catch (err) {
      errors.push(`fal.ai: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!imageBytes) {
      try {
        imageBytes = await generateViaCloudflare(article.image_prompt);
        provider = 'cloudflare';
      } catch (err) {
        errors.push(`cloudflare: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!imageBytes) {
      try {
        imageBytes = await generateViaGoogle(article.image_prompt);
        provider = 'google';
      } catch (err) {
        errors.push(`google: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!imageBytes) {
      throw new Error(`All image providers failed — ${errors.join(' | ')}`);
    }

    // Upload to Supabase Storage (upsert so regeneration overwrites the old file)
    const storagePath = `${article_id}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('article-images')
      .upload(storagePath, imageBytes, { contentType: 'image/png', upsert: true });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // Permanent public URL — never expires
    const imageUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/article-images/${storagePath}`;

    const { error: updateErr } = await supabase
      .from('articles')
      .update({ generated_image_url: imageUrl })
      .eq('id', article_id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    return json({ url: imageUrl, provider, ...(errors.length > 0 ? { fallback_errors: errors } : {}) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
