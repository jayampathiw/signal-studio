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

const GITHUB_OWNER    = 'jayampathiw';
const GITHUB_REPO     = 'reel-pipeline';
const GITHUB_WORKFLOW = 'longform.yml';

// Legal stage transitions: current_status → stage → running_status
// Only these combinations are allowed — everything else returns 409.
const TRANSITIONS: Record<string, { from: string[]; running: string }> = {
  script:       { from: ['brief', 'awaiting_script_approval'],                        running: 'scripting' },
  seed:         { from: ['awaiting_script_approval', 'awaiting_refs'],                running: 'seeding'   },
  tts:          { from: ['awaiting_refs'],                                             running: 'seeding'   },
  assemble:     { from: ['awaiting_stills'],                                           running: 'rendering' },
  tts_assemble: { from: ['awaiting_final_approval', 'awaiting_stills', 'awaiting_refs'], running: 'rendering' },
  publish:      { from: ['awaiting_final_approval'],                                   running: 'publishing'},
  noop:         { from: ['*'],                                                         running: ''          },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: { project_id?: number; stage?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { project_id, stage } = body;
  if (!project_id) return json({ error: 'project_id is required' }, 400);
  if (!stage)      return json({ error: 'stage is required (script|seed|tts|assemble|publish|noop)' }, 400);

  const transition = TRANSITIONS[stage];
  if (!transition) return json({ error: `Unknown stage "${stage}". Valid: ${Object.keys(TRANSITIONS).join(', ')}` }, 400);

  const githubPat = Deno.env.get('GITHUB_PAT');
  if (!githubPat) return json({ error: 'GITHUB_PAT secret not configured' }, 500);

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: item, error: fetchErr } = await db
    .from('content_items')
    .select('id, status, channel_key')
    .eq('id', project_id)
    .single();

  if (fetchErr || !item) return json({ error: fetchErr?.message ?? 'Project not found' }, 404);

  // Validate transition (noop skips this check)
  const allowedFrom = transition.from;
  if (!allowedFrom.includes('*') && !allowedFrom.includes(item.status)) {
    return json({
      error: `Cannot run stage "${stage}" when project is "${item.status}". ` +
             `Allowed from: ${allowedFrom.join(', ')}`,
    }, 409);
  }

  // noop: just verify the project exists, return current state
  if (stage === 'noop') {
    return json({ dispatched: false, stage: 'noop', current_status: item.status });
  }

  // Flip status to the running value before dispatch so a crash is visible
  const { error: updateErr } = await db
    .from('content_items')
    .update({ status: transition.running, status_note: `${stage} dispatched` })
    .eq('id', project_id);

  if (updateErr) return json({ error: `Status update failed: ${updateErr.message}` }, 500);

  // Dispatch longform.yml
  const ghHeaders = {
    'Authorization': `Bearer ${githubPat}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'signal-studio-longform',
  };

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        ref: 'main',
        inputs: { project_id: String(project_id), stage },
      }),
    },
  );

  if (!dispatchRes.ok) {
    const err = await dispatchRes.json().catch(() => ({ message: dispatchRes.statusText }));
    // Rollback status on dispatch failure
    await db.from('content_items').update({ status: item.status, status_note: `dispatch failed: ${err.message}` }).eq('id', project_id);
    return json({ error: `GitHub dispatch failed (${dispatchRes.status}): ${err.message}` }, 502);
  }

  // Wait 2s then fetch the queued run URL
  await new Promise(r => setTimeout(r, 2000));
  const runsRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?per_page=1&event=workflow_dispatch`,
    { headers: ghHeaders },
  );
  let runUrl: string | null = null;
  if (runsRes.ok) {
    const runs = await runsRes.json();
    runUrl = runs.workflow_runs?.[0]?.html_url ?? null;
  }

  return json({ dispatched: true, stage, previous_status: item.status, running_status: transition.running, runUrl });
});
