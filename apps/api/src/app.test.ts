import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Project } from '@signal-studio/core/schemas';
import { hashApiKey } from '@signal-studio/db/repos';

import { createApp, type AppDeps } from './app.ts';

const API_KEY = 'sk_test_key';
const ORG_ID = 'org-1';
const PROJECT_ID = 'project-1';

function validManifest() {
  return {
    version: '1',
    projectRef: 'test-project',
    template: 'clips-overlay',
    visual: { mode: 'clips-overlay' },
    shots: [{ id: 's1', clip: 's1.mp4', overlay_out_s: 1.5, voiceover_text: 'A fact.' }],
    end_card: { subject: 'Test', disclosure: 'AI visualisation' },
    outputs: ['fb'],
  };
}

function fakeDeps(overrides: Partial<AppDeps> = {}) {
  const jobs = new Map<string, Record<string, unknown>>();
  let nextId = 1;

  const jobsRepo = {
    async create(orgId: string, projectId: string, manifest: unknown) {
      const id = `job-${nextId++}`;
      const row = {
        id,
        org_id: orgId,
        project_id: projectId,
        manifest,
        status: 'created',
        created_at: 't',
        updated_at: 't',
      };
      jobs.set(id, row);
      return row;
    },
    async getById(id: string) {
      return jobs.get(id) ?? null;
    },
    async listByProject(orgId: string, projectId: string) {
      return [...jobs.values()].filter((j) => j.org_id === orgId && j.project_id === projectId);
    },
    async updateStatus(id: string, status: string) {
      const job = jobs.get(id);
      if (job) job.status = status;
    },
  };

  function baseProjectConfig(slug: string) {
    return {
      slug,
      orgId: ORG_ID,
      gates: [],
      defaults: { template: 'clips-overlay', voice: 'bm_george', speed: 1, outputs: ['fb'] },
      providers: {
        tts: 'kokoro-js',
        captions: 'whisper',
        image: 'fal',
        storage: 'local',
        publish: 'facebook',
      },
    };
  }
  const projectRows = new Map<string, Record<string, unknown>>([
    [
      'test-project',
      {
        id: PROJECT_ID,
        org_id: ORG_ID,
        slug: 'test-project',
        config: baseProjectConfig('test-project'),
      },
    ],
  ]);
  const projectsRepo = {
    async getBySlug(orgId: string, slug: string) {
      const row = projectRows.get(slug);
      if (row && orgId === ORG_ID) return row;
      return null;
    },
    async getById(id: string) {
      for (const row of projectRows.values()) if (row.id === id) return row;
      return null;
    },
    async listByOrg(orgId: string) {
      if (orgId !== ORG_ID) return [];
      return [...projectRows.values()];
    },
    async updateConfig(orgId: string, slug: string, config: unknown) {
      const row = projectRows.get(slug);
      if (!row || orgId !== ORG_ID) throw new Error('not found');
      row.config = config;
      return row;
    },
  };

  const artifactRows: Record<string, unknown>[] = [];
  const artifactsRepo = {
    async listForJob(jobId: string) {
      return artifactRows.filter((a) => a.job_id === jobId);
    },
  };

  const generationAttempts: Record<string, unknown>[] = [];
  const generationAttemptsRepo = {
    async create(
      orgId: string,
      args: {
        projectId: string;
        jobId?: string;
        shotPurpose: string;
        succeeded: boolean;
        note?: string;
        createdBy?: string;
      },
    ) {
      const row = {
        id: `ga-${generationAttempts.length + 1}`,
        org_id: orgId,
        project_id: args.projectId,
        job_id: args.jobId ?? null,
        shot_purpose: args.shotPurpose,
        succeeded: args.succeeded,
        note: args.note ?? null,
        created_by: args.createdBy ?? null,
      };
      generationAttempts.push(row);
      return row;
    },
    async weeklyReport() {
      return [{ shot_purpose: 'b-roll', attempts: 2, succeeded: 1, failed: 1 }];
    },
  };

  const userOrgsRepo = {
    async getOrgIdForUser(userId: string) {
      return userId === 'user-1' ? ORG_ID : null;
    },
  };

  const apiKeysRepo = {
    async findByHash(hash: string) {
      if (hash === hashApiKey(API_KEY))
        return {
          id: 'key-1',
          org_id: ORG_ID,
          name: 'test',
          key_hash: hash,
          created_at: 't',
          revoked_at: null,
        };
      return null;
    },
  };

  const deps: AppDeps = {
    jobsRepo: jobsRepo as never,
    projectsRepo: projectsRepo as never,
    apiKeysRepo: apiKeysRepo as never,
    createStorage: () => ({
      async put() {
        return { url: 'file:///fake' };
      },
      async signedUrl() {
        return 'file:///fake';
      },
      async presignUpload(key: string) {
        return `https://fake-storage.example/${key}?signed=1`;
      },
    }),
    dispatcher: { dispatch: async () => {} },
    createJobStagesRepo: () =>
      ({
        async listRecent() {
          return [];
        },
        async log() {},
        async listForJob() {
          return [];
        },
      }) as never,
    createArtifactsRepo: () => artifactsRepo as never,
    createGenerationAttemptsRepo: () => generationAttemptsRepo as never,
    userOrgsRepo: userOrgsRepo as never,
    engineSupabaseUrl: 'https://engine.example.supabase.co',
    engineSupabaseAnonKey: 'anon-key',
    ...overrides,
  };

  return { deps, jobs, artifactRows, generationAttempts, projectRows };
}

test('GET /health: no auth required', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  const res = await app.request('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('POST /jobs: 401 without an API key', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  const res = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  assert.equal(res.status, 401);
});

test('POST /jobs -> GET /jobs/:id: creates and reads back a job with a valid key', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);

  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.status, 'created');
  assert.equal(created.org_id, ORG_ID);

  const getRes = await app.request(`/jobs/${created.id}`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(getRes.status, 200);
  assert.deepEqual(await getRes.json(), created);
});

test('POST /jobs: 404 for an unknown project slug', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  const res = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'no-such-project', manifest: validManifest() }),
  });
  assert.equal(res.status, 404);
});

test('GET /jobs/:id: 404 for a job belonging to another org (never leaks existence)', async () => {
  const { deps, jobs } = fakeDeps();
  jobs.set('job-other-org', {
    id: 'job-other-org',
    org_id: 'org-2',
    project_id: PROJECT_ID,
    manifest: validManifest(),
    status: 'created',
    created_at: 't',
    updated_at: 't',
  });
  const app = createApp(deps);
  const res = await app.request('/jobs/job-other-org', {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 404);
});

test("GET /jobs?project=: lists only that project's jobs", async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });

  const res = await app.request('/jobs?project=test-project', {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
});

test('POST /jobs/:id/assets: returns a presigned URL using the ss-upload key convention', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  const res = await app.request(`/jobs/${created.id}/assets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ shotId: 's1', filename: 's1.mp4' }),
  });
  assert.equal(res.status, 200);
  const { url, key } = await res.json();
  assert.equal(key, `jobs/${created.id}/uploads/s1/s1.mp4`);
  assert.ok(url.includes(key));
});

test('POST /jobs/:id/approve: 400 when not awaiting_review, 200 + status running otherwise', async () => {
  const { deps, jobs } = fakeDeps();
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  const tooEarly = await app.request(`/jobs/${created.id}/approve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(tooEarly.status, 400);

  jobs.get(created.id)!.status = 'awaiting_review:manual-review';
  const res = await app.request(`/jobs/${created.id}/approve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'running');
});

test('POST /jobs/:id/dispatch: calls the dispatcher only when queued', async () => {
  const dispatchCalls: string[] = [];
  const { deps, jobs } = fakeDeps({
    dispatcher: { dispatch: async (id: string) => void dispatchCalls.push(id) },
  });
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  const notQueued = await app.request(`/jobs/${created.id}/dispatch`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(notQueued.status, 400);
  assert.equal(dispatchCalls.length, 0);

  jobs.get(created.id)!.status = 'queued';
  const res = await app.request(`/jobs/${created.id}/dispatch`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(dispatchCalls, [created.id]);
});

test('GET /openapi.json: serves a real generated OpenAPI document', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  const res = await app.request('/openapi.json');
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.equal(doc.openapi, '3.0.0');
  assert.ok(doc.paths['/jobs']);
  assert.ok(doc.paths['/jobs/{id}/approve']);
});

test('GET /jobs/:id/log: returns entries scoped to the org, 404 for another org or missing job', async () => {
  const logEntries = [
    { id: 1, stage_name: 'assets', message: 'running (hash=abc)', created_at: 't1' },
    { id: 2, stage_name: 'assets', message: 'skipped (unchanged, hash=abc)', created_at: 't2' },
  ];
  let capturedTail: number | undefined;
  const { deps, jobs } = fakeDeps({
    createJobStagesRepo: () =>
      ({
        async listRecent(_jobId: string, tail: number) {
          capturedTail = tail;
          return logEntries;
        },
      }) as never,
  });
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  const res = await app.request(`/jobs/${created.id}/log?tail=10`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), logEntries);
  assert.equal(capturedTail, 10);

  // Default tail when the query param is omitted.
  await app.request(`/jobs/${created.id}/log`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(capturedTail, 50);

  // A job belonging to another org reads as 404, same convention as
  // GET /jobs/:id.
  jobs.get(created.id)!.org_id = 'some-other-org';
  const forbidden = await app.request(`/jobs/${created.id}/log`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(forbidden.status, 404);

  const missing = await app.request('/jobs/does-not-exist/log', {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(missing.status, 404);
});

test('onError: an unhandled route error is logged with real request context and returns a generic 500', async () => {
  const logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
  const { deps, jobs } = fakeDeps({
    dispatcher: {
      dispatch: async () => {
        throw new Error('github is down');
      },
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (message, meta) => logs.push({ level: 'error', message, meta }),
    },
  });
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();
  jobs.get(created.id)!.status = 'queued';

  const res = await app.request(`/jobs/${created.id}/dispatch`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });

  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Internal server error' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].message, 'unhandled request error');
  assert.equal(logs[0].meta?.error, 'github is down');
  assert.equal(logs[0].meta?.path, `/jobs/${created.id}/dispatch`);
});

test('onError: reportError is called with the error and request context; omitted when not supplied', async () => {
  const reported: Array<{ err: unknown; context: unknown }> = [];
  const { deps, jobs } = fakeDeps({
    dispatcher: {
      dispatch: async () => {
        throw new Error('github is down');
      },
    },
    reportError: (err, context) => reported.push({ err, context }),
  });
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();
  jobs.get(created.id)!.status = 'queued';

  const res = await app.request(`/jobs/${created.id}/dispatch`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 500);
  assert.equal(reported.length, 1);
  assert.equal((reported[0].err as Error).message, 'github is down');
  assert.deepEqual(reported[0].context, {
    method: 'POST',
    path: `/jobs/${created.id}/dispatch`,
  });
});

// ---- P5.1: combined auth (Supabase Auth session, alongside API keys) ----

function fakeAuthFetch(validToken: string, userId: string): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith('/auth/v1/user')) throw new Error(`unexpected fetch: ${url}`);
    const auth = (init?.headers as Record<string, string> | undefined)?.['Authorization'];
    if (auth === `Bearer ${validToken}`) {
      return new Response(JSON.stringify({ id: userId }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'invalid' }), { status: 401 });
  }) as unknown as typeof fetch;
}

test('GET /me: 401 with no credential, resolves orgId for a real API key, and for a Supabase session', async () => {
  const { deps } = fakeDeps({ authFetchFn: fakeAuthFetch('sb-token-1', 'user-1') });
  const app = createApp(deps);

  const noAuth = await app.request('/me');
  assert.equal(noAuth.status, 401);

  const apiKeyRes = await app.request('/me', { headers: { authorization: `Bearer ${API_KEY}` } });
  assert.equal(apiKeyRes.status, 200);
  assert.deepEqual(await apiKeyRes.json(), { orgId: ORG_ID });

  const supabaseRes = await app.request('/me', {
    headers: { authorization: 'Bearer sb-token-1' },
  });
  assert.equal(supabaseRes.status, 200);
  assert.deepEqual(await supabaseRes.json(), { orgId: ORG_ID });
});

test('GET /me: 401 for an invalid Supabase token, 403 for a user with no org mapping', async () => {
  const { deps } = fakeDeps({ authFetchFn: fakeAuthFetch('sb-token-1', 'user-1') });
  const app = createApp(deps);

  const badToken = await app.request('/me', { headers: { authorization: 'Bearer wrong' } });
  assert.equal(badToken.status, 401);

  const unmapped = await app.request('/me', {
    headers: { authorization: 'Bearer sb-token-unmapped' },
  });
  // fakeAuthFetch only recognises 'sb-token-1' — any other Supabase-shaped
  // token 401s the same way a genuinely invalid/expired one would.
  assert.equal(unmapped.status, 401);
});

test('POST /jobs/:id/reject: 400 when not awaiting review, 200 + logs the note + status failed otherwise', async () => {
  const { deps, jobs } = fakeDeps();
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  const tooEarly = await app.request(`/jobs/${created.id}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ note: 'not ready' }),
  });
  assert.equal(tooEarly.status, 400);

  jobs.get(created.id)!.status = 'awaiting_review:manual-review';
  const res = await app.request(`/jobs/${created.id}/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ note: 'blurry watermark' }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'failed');
});

test('POST /jobs/:id/cancel: 400 from a terminal status, 200 + status cancelled from a cancellable one', async () => {
  const { deps, jobs } = fakeDeps();
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  jobs.get(created.id)!.status = 'delivered';
  const tooLate = await app.request(`/jobs/${created.id}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(tooLate.status, 400);

  jobs.get(created.id)!.status = 'queued';
  const res = await app.request(`/jobs/${created.id}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, 'cancelled');
});

test('POST /jobs/:id/retry: 400 unless failed, otherwise requeues and dispatches', async () => {
  const dispatchCalls: string[] = [];
  const { deps, jobs } = fakeDeps({
    dispatcher: { dispatch: async (id: string) => void dispatchCalls.push(id) },
  });
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  const notFailed = await app.request(`/jobs/${created.id}/retry`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(notFailed.status, 400);

  jobs.get(created.id)!.status = 'failed';
  const res = await app.request(`/jobs/${created.id}/retry`, {
    method: 'POST',
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { dispatched: true });
  assert.equal(jobs.get(created.id)!.status, 'queued');
  assert.deepEqual(dispatchCalls, [created.id]);
});

test('GET /jobs/:id/artifacts: returns artifacts scoped to the job, 404 for another org', async () => {
  const { deps, jobs, artifactRows } = fakeDeps();
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();
  artifactRows.push({ id: 'art-1', job_id: created.id, url: 'https://cdn.example/fb.mp4' });

  const res = await app.request(`/jobs/${created.id}/artifacts`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'art-1');

  jobs.get(created.id)!.org_id = 'some-other-org';
  const forbidden = await app.request(`/jobs/${created.id}/artifacts`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(forbidden.status, 404);
});

test("GET /projects: lists the org's projects", async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  const res = await app.request('/projects', { headers: { authorization: `Bearer ${API_KEY}` } });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].slug, 'test-project');
});

test('GET /projects/:slug: 200 for a real project, 404 for an unknown one', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);
  const res = await app.request('/projects/test-project', {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).slug, 'test-project');

  const missing = await app.request('/projects/no-such-project', {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(missing.status, 404);
});

test('PATCH /projects/:slug: 404 unless it exists, otherwise saves the new config', async () => {
  const { deps, projectRows } = fakeDeps();
  const app = createApp(deps);
  const newConfig = {
    slug: 'test-project',
    orgId: ORG_ID,
    gates: ['manual-review'],
    defaults: { template: 'clips-overlay', voice: 'bm_george', speed: 1, outputs: ['fb'] },
    providers: {
      tts: 'kokoro-js',
      captions: 'whisper',
      image: 'fal',
      storage: 'local',
      publish: 'facebook',
    },
  };

  const missing = await app.request('/projects/no-such-project', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(newConfig),
  });
  assert.equal(missing.status, 404);

  const res = await app.request('/projects/test-project', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(newConfig),
  });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).config.gates, ['manual-review']);
  // The route validates the request body against the full `Project` zod
  // schema before saving — comparing against `Project.parse(newConfig)`
  // rather than `newConfig` itself, since that parse fills in defaults
  // (`brand`, `qa`) the raw literal above doesn't specify.
  assert.deepEqual(projectRows.get('test-project')!.config, Project.parse(newConfig));
});

test('POST /manifest/validate: 200 for a valid manifest, 400 with issues for an invalid one', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);

  const ok = await app.request('/manifest/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(validManifest()),
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { valid: true });

  const bad = await app.request('/manifest/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ not: 'a manifest' }),
  });
  assert.equal(bad.status, 400);
  const badBody = await bad.json();
  assert.equal(badBody.valid, false);
  assert.ok(badBody.issues.length > 0);
});

test('POST /generation-attempts -> GET /generation-attempts: logs an attempt and returns the report', async () => {
  const { deps } = fakeDeps({ authFetchFn: fakeAuthFetch('sb-token-1', 'user-1') });
  const app = createApp(deps);

  const created = await app.request('/generation-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sb-token-1' },
    body: JSON.stringify({
      projectSlug: 'test-project',
      shotPurpose: 'wildlife-b-roll',
      succeeded: false,
      note: 'out of focus',
    }),
  });
  assert.equal(created.status, 201);
  const row = await created.json();
  assert.equal(row.shot_purpose, 'wildlife-b-roll');
  assert.equal(row.created_by, 'user-1');

  const missingProject = await app.request('/generation-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'no-such', shotPurpose: 'x', succeeded: true }),
  });
  assert.equal(missingProject.status, 404);

  const report = await app.request('/generation-attempts?project=test-project', {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(report.status, 200);
  assert.ok(Array.isArray(await report.json()));
});

test('GET /jobs/:id/stages: returns the stage timeline, 404 for another org or missing job', async () => {
  const stageRows = [
    {
      stage_name: 'assets',
      output_id: '',
      status: 'done',
      warnings: null,
      started_at: 't1',
      ended_at: 't2',
    },
  ];
  const { deps, jobs } = fakeDeps({
    createJobStagesRepo: () =>
      ({
        async listForJob() {
          return stageRows;
        },
      }) as never,
  });
  const app = createApp(deps);
  const createRes = await app.request('/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ projectSlug: 'test-project', manifest: validManifest() }),
  });
  const created = await createRes.json();

  const res = await app.request(`/jobs/${created.id}/stages`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), stageRows);

  jobs.get(created.id)!.org_id = 'some-other-org';
  const forbidden = await app.request(`/jobs/${created.id}/stages`, {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(forbidden.status, 404);

  const missing = await app.request('/jobs/does-not-exist/stages', {
    headers: { authorization: `Bearer ${API_KEY}` },
  });
  assert.equal(missing.status, 404);
});

test('POST /manifest/from-pack: converts a real pack.json to a manifest, 400 on an invalid pack', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);

  const pack = {
    post_id: 'p1',
    subject: 'test',
    fact_confidence: 'high',
    verify: 'checked against source',
    outputs: ['fb'],
    shots: [
      {
        id: 's1',
        clip_file: 's1.mp4',
        overlay_text: 'A fact',
        overlay_out_s: 1.5,
        voiceover_text: 'A fact.',
        fact_confidence: 'high',
        verify: 'checked against source',
      },
    ],
    end_card: { subject: 'Test', disclosure: 'AI visualisation' },
  };

  const res = await app.request('/manifest/from-pack', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ pack, projectRef: 'test-project' }),
  });
  assert.equal(res.status, 200);
  const { manifest } = await res.json();
  assert.equal(manifest.projectRef, 'test-project');
  assert.equal(manifest.shots[0].id, 's1');

  const bad = await app.request('/manifest/from-pack', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ pack: { not: 'a pack' }, projectRef: 'test-project' }),
  });
  assert.equal(bad.status, 400);
});

test('CORS: a real preflight from the dashboard dev origin is allowed; an untrusted origin is not', async () => {
  const { deps } = fakeDeps();
  const app = createApp(deps);

  const allowed = await app.request('/jobs', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:4299',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:4299');

  const untrusted = await app.request('/jobs', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(untrusted.headers.get('access-control-allow-origin'), null);
});
