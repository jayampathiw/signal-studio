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

// channel_key → workflow dispatch slug (mirrors apps/video/src/config/channel-slugs.js)
const CHANNEL_SLUG: Record<string, string> = {
  'wildlife/intimacy/EN': 'wild-eye',
  'wildlife/factual/EN': 'wildlife-factual',
  'wildlife/listicle/EN': 'wildlife-listicle',
  'wildlife/cinematic/EN': 'wildlife-cinematic',
  'wildlife/silent/EN': 'wildlife-silent',
};

const GITHUB_OWNER = 'jayampathiw';
const GITHUB_REPO = 'reel-pipeline';
const GITHUB_WORKFLOW = 'generate.yml';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { content_item_id?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { content_item_id } = body;
  if (!content_item_id) return json({ error: 'content_item_id is required' }, 400);

  const githubPat = Deno.env.get('GITHUB_PAT');
  if (!githubPat)
    return json(
      {
        error:
          'GITHUB_PAT secret not configured — add it via Supabase Dashboard → Edge Functions → Secrets',
      },
      500,
    );

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: item, error: fetchErr } = await supabase
    .from('content_items')
    .select('id, status, channel_key')
    .eq('id', content_item_id)
    .single();

  if (fetchErr || !item) return json({ error: fetchErr?.message ?? 'Content item not found' }, 404);
  if (item.status !== 'storyboard') {
    return json(
      { error: `Expected status 'storyboard', got '${item.status}'. Save your scene edits first.` },
      422,
    );
  }

  const channelSlug = CHANNEL_SLUG[item.channel_key] ?? 'wild-eye';

  const ghHeaders = {
    Authorization: `Bearer ${githubPat}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'signal-studio-dashboard',
  };

  // Dispatch the workflow run
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          channel: channelSlug,
          content_id: String(content_item_id),
        },
      }),
    },
  );

  if (!dispatchRes.ok) {
    const err = await dispatchRes.json().catch(() => ({ message: dispatchRes.statusText }));
    return json(
      {
        error: `GitHub dispatch failed (${dispatchRes.status}): ${err.message ?? 'unknown error'}`,
      },
      502,
    );
  }

  // 204 No Content on success — wait 2s then fetch the queued run URL
  await new Promise((r) => setTimeout(r, 2000));

  const runsRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?per_page=1&event=workflow_dispatch`,
    { headers: ghHeaders },
  );

  let runUrl: string | null = null;
  if (runsRes.ok) {
    const runs = await runsRes.json();
    runUrl = runs.workflow_runs?.[0]?.html_url ?? null;
  }

  return json({ dispatched: true, channelSlug, runUrl });
});
