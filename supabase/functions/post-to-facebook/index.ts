import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FB_BASE = 'https://graph.facebook.com/v22.0';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    return await handleRequest(req);
  } catch (err: any) {
    console.error('Unhandled error:', err?.message ?? err);
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { article_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.article_ids?.length) {
    return new Response(JSON.stringify({ error: 'article_ids array is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, ai_caption, original_url, country, status')
    .in('id', body.article_ids);

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: { id: string; success: boolean; fb_post_id?: string; error?: string }[] = [];

  for (const article of articles ?? []) {
    const result = await postArticle(supabase, article);
    results.push(result);
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function postArticle(
  supabase: ReturnType<typeof createClient>,
  article: { id: string; ai_caption: any; original_url: string; country: string; status: string },
): Promise<{ id: string; success: boolean; fb_post_id?: string; error?: string }> {
  if (article.status !== 'approved') {
    return { id: article.id, success: false, error: `Article status is '${article.status}', must be 'approved'` };
  }

  const captionText: string | undefined = article.ai_caption?.text;
  if (!captionText) {
    return { id: article.id, success: false, error: 'No ai_caption.text — run Generate first' };
  }

  const pageId = Deno.env.get(`FB_PAGE_ID_${article.country}`);
  const token  = Deno.env.get(`FB_ACCESS_TOKEN_${article.country}`);

  if (!pageId || !token) {
    return { id: article.id, success: false, error: `Missing Facebook credentials for country: ${article.country}` };
  }

  try {
    const fbRes = await fetch(`${FB_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: captionText,
        link: article.original_url,
        access_token: token,
      }),
    });

    const fbData = await fbRes.json();

    if (!fbRes.ok) {
      const errMsg = fbData?.error?.message ?? `Facebook API error ${fbRes.status}`;
      await supabase.from('articles').update({ status: 'failed' }).eq('id', article.id);
      return { id: article.id, success: false, error: errMsg };
    }

    const fbPostId: string = fbData.id;
    await supabase.from('articles').update({ status: 'posted', fb_post_id: fbPostId }).eq('id', article.id);
    return { id: article.id, success: true, fb_post_id: fbPostId };
  } catch (err: any) {
    await supabase.from('articles').update({ status: 'failed' }).eq('id', article.id);
    return { id: article.id, success: false, error: err?.message ?? String(err) };
  }
}
