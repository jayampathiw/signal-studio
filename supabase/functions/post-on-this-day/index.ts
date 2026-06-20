import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FB_BASE = 'https://graph.facebook.com/v22.0';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    return await handleRequest(req);
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { post_id } = await req.json();
  if (!post_id) {
    return new Response(JSON.stringify({ error: 'post_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: post, error: fetchErr } = await supabase
    .from('on_this_day_posts')
    .select('*')
    .eq('id', post_id)
    .single();

  if (fetchErr || !post) {
    return new Response(JSON.stringify({ error: `Post not found: ${post_id}` }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (post.status === 'posted') {
    return new Response(JSON.stringify({ error: 'Already posted', fb_post_id: post.fb_post_id }), {
      status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const imageUrls: string[] = (post.events ?? []).map((e: any) => e.image_url).filter(Boolean);
  if (!imageUrls.length) {
    return new Response(JSON.stringify({ error: 'No images available — regenerate the post first' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const country = post.country as string;
  const pageId  = Deno.env.get(`FB_PAGE_ID_${country}`);
  const token   = Deno.env.get(`FB_ACCESS_TOKEN_${country}`);

  if (!pageId || !token) {
    return new Response(JSON.stringify({ error: `Missing Facebook credentials for country: ${country}` }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Upload each image as an unpublished FB photo, collect photo IDs
  const photoIds: string[] = [];
  for (const url of imageUrls) {
    const r = await fetch(`${FB_BASE}/${pageId}/photos?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, published: false }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(`FB photo upload failed: ${d?.error?.message ?? r.status}`);
    photoIds.push(d.id);
  }

  const { intro, question, cta } = post.ai_caption ?? {};
  const message = [intro, question, cta].filter(Boolean).join('\n\n');

  const feedRes = await fetch(`${FB_BASE}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      attached_media: photoIds.map(id => ({ media_fbid: id })),
      access_token: token,
    }),
  });

  const feedData = await feedRes.json();
  if (!feedRes.ok) {
    await supabase.from('on_this_day_posts').update({ status: 'failed' }).eq('id', post_id);
    return new Response(JSON.stringify({ error: feedData?.error?.message ?? 'Feed post failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const fbPostId = feedData.id as string;
  await supabase.from('on_this_day_posts').update({
    status: 'posted',
    fb_post_id: fbPostId,
    posted_at: new Date().toISOString(),
  }).eq('id', post_id);

  return new Response(JSON.stringify({ success: true, fb_post_id: fbPostId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
