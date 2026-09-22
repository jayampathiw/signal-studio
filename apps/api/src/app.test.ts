import assert from 'node:assert/strict';
import { test } from 'node:test';

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

function fakeDeps(overrides: Partial<AppDeps> = {}): {
  deps: AppDeps;
  jobs: Map<string, Record<string, unknown>>;
} {
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

  const projectsRepo = {
    async getBySlug(orgId: string, slug: string) {
      if (orgId === ORG_ID && slug === 'test-project') {
        return {
          id: PROJECT_ID,
          org_id: ORG_ID,
          slug,
          config: {
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
          },
        };
      }
      return null;
    },
    async getById(id: string) {
      if (id === PROJECT_ID) return this.getBySlug(ORG_ID, 'test-project');
      return null;
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
    ...overrides,
  };

  return { deps, jobs };
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
