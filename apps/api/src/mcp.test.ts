import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

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
    createJobStagesRepo: () => ({ listRecent: async () => [], listForJob: async () => [] }) as never,
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

test('get_job on another org\'s job returns an MCP tool error, not the job', async () => {
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

test('the server advertises exactly the 5 tools the plan asks for', async () => {
  const deps = fakeDeps();
  const client = await connectedClient(deps, ORG_ID);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    'approve_gate',
    'create_job',
    'get_job',
    'list_jobs',
    'presign_upload',
  ]);
});
