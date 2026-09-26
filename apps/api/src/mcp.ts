import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveJob } from '@signal-studio/core/resolve';
import { Manifest } from '@signal-studio/core/schemas';
import { assertJobTransition, type JobStatus } from '@signal-studio/core/state';
import { z } from 'zod';

import type { AppDeps } from './app.ts';

/**
 * P4.5 (optional) — the 5 tools the plan asks for, each a thin wrapper over
 * the exact same `deps` the REST routes in `app.ts` already use (not a
 * second implementation of job-creation/presigning logic). `approve_gate`
 * maps to the existing `awaiting_review -> running` transition (`POST
 * /jobs/:id/approve`'s own logic) — "gate" is the plan's name for what the
 * rest of this codebase calls a review gate.
 *
 * One `McpServer` per request (`createMcpServer` is called fresh from the
 * `/mcp` route handler each time), with `orgId` closed over from
 * `combinedAuth` — same per-request-scoping reasoning as
 * `createJobStagesRepo(orgId)` etc. in `AppDeps`. This is why there's no
 * server-side session/tool state here: the Streamable HTTP transport in
 * `app.ts` runs in stateless mode (`sessionIdGenerator: undefined`), which
 * is enough for tool calls that are each a single request/response — no
 * server-initiated push (resources, sampling) is used by any of these 5
 * tools.
 */
export function createMcpServer(deps: AppDeps, orgId: string): McpServer {
  const server = new McpServer({ name: 'signal-studio-engine', version: '0.1.0' });

  server.registerTool(
    'create_job',
    {
      title: 'Create job',
      description: 'Create a new render job for a project from a manifest.v1 document.',
      inputSchema: { projectSlug: z.string().min(1), manifest: Manifest },
    },
    async ({ projectSlug, manifest }) => {
      const project = await deps.projectsRepo.getBySlug(orgId, projectSlug);
      if (!project) {
        return {
          content: [{ type: 'text', text: `No project "${projectSlug}" for this org` }],
          isError: true,
        };
      }
      const job = await deps.jobsRepo.create(orgId, project.id, manifest);
      return { content: [{ type: 'text', text: JSON.stringify(job) }] };
    },
  );

  server.registerTool(
    'get_job',
    {
      title: 'Get job',
      description: 'Fetch a single job by id.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) {
        return { content: [{ type: 'text', text: 'Job not found' }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(job) }] };
    },
  );

  server.registerTool(
    'list_jobs',
    {
      title: 'List jobs',
      description: 'List jobs for a project, by project slug.',
      inputSchema: { projectSlug: z.string().min(1) },
    },
    async ({ projectSlug }) => {
      const project = await deps.projectsRepo.getBySlug(orgId, projectSlug);
      if (!project) {
        return {
          content: [{ type: 'text', text: `No project "${projectSlug}" for this org` }],
          isError: true,
        };
      }
      const jobs = await deps.jobsRepo.listByProject(orgId, project.id);
      return { content: [{ type: 'text', text: JSON.stringify(jobs) }] };
    },
  );

  server.registerTool(
    'approve_gate',
    {
      title: 'Approve review gate',
      description: 'Approve a job currently awaiting review, moving it to running.',
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) {
        return { content: [{ type: 'text', text: 'Job not found' }], isError: true };
      }
      if (!job.status.startsWith('awaiting_review:')) {
        return {
          content: [{ type: 'text', text: `Job is "${job.status}", not awaiting review` }],
          isError: true,
        };
      }
      assertJobTransition(job.status, 'running');
      await deps.jobsRepo.updateStatus(id, 'running');
      return { content: [{ type: 'text', text: JSON.stringify({ ...job, status: 'running' as JobStatus }) }] };
    },
  );

  server.registerTool(
    'presign_upload',
    {
      title: 'Presign upload',
      description: 'Get a presigned upload URL for a shot asset on a job.',
      inputSchema: { id: z.string().min(1), shotId: z.string().min(1), filename: z.string().min(1) },
    },
    async ({ id, shotId, filename }) => {
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) {
        return { content: [{ type: 'text', text: 'Job not found' }], isError: true };
      }
      const project = await deps.projectsRepo.getById(job.project_id);
      if (!project) {
        return { content: [{ type: 'text', text: 'Job not found' }], isError: true };
      }
      const resolvedJob = resolveJob(project.config, job.manifest);
      const storage = deps.createStorage(resolvedJob.providers.storage);
      const key = `jobs/${id}/uploads/${shotId}/${filename}`;
      const url = await storage.presignUpload(key);
      return { content: [{ type: 'text', text: JSON.stringify({ url, key }) }] };
    },
  );

  return server;
}
