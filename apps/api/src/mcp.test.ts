import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { JobStatus } from '@signal-studio/core/state';

import type { AppDeps } from './app.ts';
import { createMcpServer } from './mcp.ts';

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
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

function fakeDeps(): AppDeps {
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

  const projectRows = new Map<string, Record<string, unknown>>([
    [
      'test-project',
      {
        id: PROJECT_ID,
        org_id: ORG_ID,
        slug: 'test-project',
        config: {
          slug: 'test-project',
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
    async updateConfig() {
      throw new Error('not used by mcp tools');
    },
  };

  return {
    jobsRepo: jobsRepo as never,
    projectsRepo: projectsRepo as never,
    apiKeysRepo: { findByHash: async () => null } as never,
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
      ({ listRecent: async () => [], listForJob: async () => [] }) as never,
    createArtifactsRepo: () => ({ listForJob: async () => [] }) as never,
    createGenerationAttemptsRepo: () =>
      ({ create: async () => ({}), weeklyReport: async () => [] }) as never,
    userOrgsRepo: { getOrgIdForUser: async () => null } as never,
    engineSupabaseUrl: 'https://fake.supabase.co',
    engineSupabaseAnonKey: 'fake-anon-key',
  };
}

async function connectedClient(deps: AppDeps, orgId: string) {
  const server = createMcpServer(deps, orgId);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function firstText(result: { content: Array<{ type: string; text?: string }> }) {
  const block = result.content[0];
  assert.equal(block.type, 'text');
  return block.text as string;
}

test('create_job then get_job round-trips through real MCP tool calls', async () => {
  const deps = fakeDeps();
  const client = await connectedClient(deps, ORG_ID);

  const created = await client.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  assert.equal(created.isError, undefined);
  const job = JSON.parse(firstText(created as never));
  assert.equal(job.status, 'created');
  assert.equal(job.org_id, ORG_ID);

  const fetched = await client.callTool({ name: 'get_job', arguments: { id: job.id } });
  assert.equal(JSON.parse(firstText(fetched as never)).id, job.id);
});

test('list_jobs returns only jobs for the requested project', async () => {
  const deps = fakeDeps();
  const client = await connectedClient(deps, ORG_ID);
  await client.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });

  const listed = await client.callTool({
    name: 'list_jobs',
    arguments: { projectSlug: 'test-project' },
  });
  const jobs = JSON.parse(firstText(listed as never));
  assert.equal(jobs.length, 1);
});

test("get_job on another org's job returns an MCP tool error, not the job", async () => {
  const deps = fakeDeps();
  const ownerClient = await connectedClient(deps, ORG_ID);
  const created = await ownerClient.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  const job = JSON.parse(firstText(created as never));

  const intruderClient = await connectedClient(deps, OTHER_ORG_ID);
  const result = await intruderClient.callTool({ name: 'get_job', arguments: { id: job.id } });
  assert.equal(result.isError, true);
});

test('approve_gate rejects a job not awaiting review', async () => {
  const deps = fakeDeps();
  const client = await connectedClient(deps, ORG_ID);
  const created = await client.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  const job = JSON.parse(firstText(created as never));

  const result = await client.callTool({ name: 'approve_gate', arguments: { id: job.id } });
  assert.equal(result.isError, true);
  assert.match(firstText(result as never), /not awaiting review/);
});

test('approve_gate on the last gate queues the job for publish-only dispatch', async () => {
  const deps = fakeDeps();
  const dispatchCalls: Array<[string, string | undefined]> = [];
  deps.dispatcher = { dispatch: async (id, mode) => void dispatchCalls.push([id, mode]) };
  const client = await connectedClient(deps, ORG_ID);
  const created = await client.callTool({
    name: 'create_job',
    arguments: {
      projectSlug: 'test-project',
      manifest: { ...validManifest(), gates: ['review'], publish: ['facebook'] },
    },
  });
  const job = JSON.parse(firstText(created as never));
  await deps.jobsRepo.updateStatus(job.id, 'awaiting_review:review');

  const result = await client.callTool({ name: 'approve_gate', arguments: { id: job.id } });
  assert.equal(result.isError, undefined);
  assert.equal(JSON.parse(firstText(result as never)).status, 'queued');
  assert.deepEqual(dispatchCalls, [[job.id, 'publish']]);
});

test('approve_gate passes publishAt through, and reports a bad one as a tool error', async () => {
  const deps = fakeDeps();
  deps.dispatcher = { dispatch: async () => {} };
  const client = await connectedClient(deps, ORG_ID);
  const created = await client.callTool({
    name: 'create_job',
    arguments: {
      projectSlug: 'test-project',
      manifest: { ...validManifest(), gates: ['review'], publish: ['facebook'] },
    },
  });
  const job = JSON.parse(firstText(created as never));
  await deps.jobsRepo.updateStatus(job.id, 'awaiting_review:review');

  const bad = await client.callTool({
    name: 'approve_gate',
    arguments: { id: job.id, publishAt: '2026-10-31T19:00:00' },
  });
  assert.equal(bad.isError, true);
  assert.match(firstText(bad as never), /needs a timezone/);

  const recorded: unknown[] = [];
  deps.createArtifactsRepo = () =>
    ({ record: async (...args: unknown[]) => void recorded.push(args[4]) }) as never;
  const publishAt = new Date(Date.now() + 6 * 3600_000).toISOString();
  const ok = await client.callTool({ name: 'approve_gate', arguments: { id: job.id, publishAt } });
  assert.equal(ok.isError, undefined);
  assert.equal(JSON.parse(firstText(ok as never)).status, 'queued');
  assert.deepEqual(recorded, [{ gate: 'review', publishAt }]);
});

test('presign_upload returns a real presigned URL shape from the fake storage provider', async () => {
  const deps = fakeDeps();
  const client = await connectedClient(deps, ORG_ID);
  const created = await client.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  const job = JSON.parse(firstText(created as never));

  const result = await client.callTool({
    name: 'presign_upload',
    arguments: { id: job.id, shotId: 's1', filename: 'clip.mp4' },
  });
  const body = JSON.parse(firstText(result as never));
  assert.match(body.url, /^https:\/\/fake-storage\.example\//);
  assert.equal(body.key, `jobs/${job.id}/uploads/s1/clip.mp4`);
});

test('queue_job queues a created job and dispatches it', async () => {
  const deps = fakeDeps();
  const dispatchCalls: Array<[string, string | undefined]> = [];
  deps.dispatcher = { dispatch: async (id, mode) => void dispatchCalls.push([id, mode]) };
  const client = await connectedClient(deps, ORG_ID);
  const created = await client.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  const job = JSON.parse(firstText(created as never));

  const result = await client.callTool({ name: 'queue_job', arguments: { id: job.id } });
  assert.equal(result.isError, undefined);
  assert.equal(JSON.parse(firstText(result as never)).status, 'queued');
  assert.equal((await deps.jobsRepo.getById(job.id))!.status, 'queued');
  assert.deepEqual(dispatchCalls, [[job.id, undefined]]);
});

test('queue_job refuses a job that is not created/awaiting_assets, same error as the route', async () => {
  const deps = fakeDeps();
  let dispatched = false;
  deps.dispatcher = { dispatch: async () => void (dispatched = true) };
  const client = await connectedClient(deps, ORG_ID);
  const created = await client.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  const job = JSON.parse(firstText(created as never));
  await deps.jobsRepo.updateStatus(job.id, 'running');

  const result = await client.callTool({ name: 'queue_job', arguments: { id: job.id } });
  assert.equal(result.isError, true);
  assert.equal(firstText(result as never), 'Job is "running", not created/awaiting_assets');
  assert.equal(dispatched, false);
});

test("queue_job on another org's job returns not found and does not dispatch", async () => {
  const deps = fakeDeps();
  let dispatched = false;
  deps.dispatcher = { dispatch: async () => void (dispatched = true) };
  const ownerClient = await connectedClient(deps, ORG_ID);
  const created = await ownerClient.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  const job = JSON.parse(firstText(created as never));

  const intruderClient = await connectedClient(deps, OTHER_ORG_ID);
  const result = await intruderClient.callTool({ name: 'queue_job', arguments: { id: job.id } });
  assert.equal(result.isError, true);
  assert.equal(firstText(result as never), 'Job not found');
  assert.equal(dispatched, false);
});

function artifact(
  kind: string,
  url: string,
  metadata: Record<string, unknown>,
  created_at: string,
) {
  return {
    id: url,
    org_id: ORG_ID,
    job_id: 'job-1',
    stage_name: 's',
    kind,
    url,
    metadata,
    created_at,
    updated_at: created_at,
  };
}

async function jobWithArtifacts(
  status: JobStatus,
  artifacts: unknown[],
  frameBytes = Buffer.from('jpeg'),
) {
  const deps = fakeDeps();
  const grabbed: Array<{ url: string; atSec?: number; width: number }> = [];
  deps.createArtifactsRepo = () => ({ listForJob: async () => artifacts }) as never;
  deps.reviewMedia = {
    grabFrame: async (url, opts) => {
      grabbed.push({ url, ...opts });
      return frameBytes;
    },
    probeDuration: async () => 60,
  };
  const client = await connectedClient(deps, ORG_ID);
  const created = await client.callTool({
    name: 'create_job',
    arguments: { projectSlug: 'test-project', manifest: validManifest() },
  });
  const job = JSON.parse(firstText(created as never));
  await deps.jobsRepo.updateStatus(job.id, status);
  return { client, job, grabbed };
}

const PROOF_S2 = artifact('assets-proof', 'https://r2/s2.png', { shotId: 's2', page: 5 }, '1');
const PROOF_S3 = artifact('assets-proof', 'https://r2/s3.png', { shotId: 's3', page: 8 }, '2');
const APPROVAL = artifact('gate-approval', '', { gate: 'assets_review' }, '3');
const VIDEO = artifact('video', 'https://r2/fb.mp4', { outputId: 'fb' }, '4');
const POST = artifact(
  'post',
  'https://facebook.com/reel/1',
  { platform: 'facebook', postId: '1' },
  '5',
);

test('get_job includes the media links from its artifacts', async () => {
  const { client, job } = await jobWithArtifacts('delivered', [
    POST,
    VIDEO,
    APPROVAL,
    PROOF_S3,
    PROOF_S2,
  ]);
  const result = await client.callTool({ name: 'get_job', arguments: { id: job.id } });
  assert.deepEqual(JSON.parse(firstText(result as never)).media, {
    videos: [{ outputId: 'fb', url: 'https://r2/fb.mp4' }],
    proofs: [
      { shotId: 's2', url: 'https://r2/s2.png', page: 5 },
      { shotId: 's3', url: 'https://r2/s3.png', page: 8 },
    ],
    posts: [{ platform: 'facebook', url: 'https://facebook.com/reel/1' }],
  });
});

test('get_review_media at assets_review returns each proof as an image', async () => {
  const { client, job, grabbed } = await jobWithArtifacts('awaiting_review:assets_review', [
    PROOF_S2,
    PROOF_S3,
  ]);
  const result = (await client.callTool({
    name: 'get_review_media',
    arguments: { id: job.id },
  })) as {
    content: Array<{ type: string; text?: string; mimeType?: string }>;
  };
  const images = result.content.filter((b) => b.type === 'image');
  assert.equal(images.length, 2);
  assert.equal(images[0]!.mimeType, 'image/jpeg');
  assert.ok(result.content.some((b) => b.text === 'Proof for shot s2, page 5'));
  assert.deepEqual(
    grabbed.map((g) => g.url),
    ['https://r2/s2.png', 'https://r2/s3.png'],
  );
});

test('get_review_media after render returns evenly spaced video frames and the link', async () => {
  const { client, job, grabbed } = await jobWithArtifacts('awaiting_review:final_review', [
    PROOF_S2,
    APPROVAL,
    VIDEO,
  ]);
  const result = (await client.callTool({
    name: 'get_review_media',
    arguments: { id: job.id, frames: 4 },
  })) as { content: Array<{ type: string; text?: string }> };
  assert.equal(result.content.filter((b) => b.type === 'image').length, 4);
  assert.deepEqual(
    grabbed.map((g) => g.atSec),
    [7.5, 22.5, 37.5, 52.5],
  );
  assert.ok(grabbed.every((g) => g.url === 'https://r2/fb.mp4'));
  assert.match(firstText(result as never), /https:\/\/r2\/fb\.mp4/);
});

test('get_review_media reports an unreadable frame as text instead of failing', async () => {
  const { client, job } = await jobWithArtifacts(
    'awaiting_review:assets_review',
    [PROOF_S2],
    Buffer.alloc(0),
  );
  const result = (await client.callTool({
    name: 'get_review_media',
    arguments: { id: job.id },
  })) as {
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
  };
  assert.equal(result.isError, undefined);
  assert.equal(result.content.filter((b) => b.type === 'image').length, 0);
  assert.ok(
    result.content.some((b) => /could not be read \(https:\/\/r2\/s2\.png\)/.test(b.text ?? '')),
  );
});

test('the server advertises the 5 planned tools plus queue_job and get_review_media', async () => {
  const deps = fakeDeps();
  const client = await connectedClient(deps, ORG_ID);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'approve_gate',
    'create_job',
    'get_job',
    'get_review_media',
    'list_jobs',
    'presign_upload',
    'queue_job',
  ]);
});
