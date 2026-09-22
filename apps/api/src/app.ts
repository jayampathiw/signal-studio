import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { resolveJob } from '@signal-studio/core/resolve';
import { Manifest } from '@signal-studio/core/schemas';
import { assertJobTransition, type JobStatus } from '@signal-studio/core/state';
import type { ApiKeysRepo, JobsRepo, ProjectsRepo } from '@signal-studio/db/repos';
import type { StorageProvider } from '@signal-studio/providers/contracts';

import type { Dispatcher } from './dispatcher.ts';
import { apiKeyAuth, type AuthVariables } from './middleware/api-key.ts';

/**
 * P2.7 — `apps/api` (Hono): `POST /jobs`, `GET /jobs/:id`, `GET /jobs?project=`,
 * `POST /jobs/:id/assets` (presign), `POST /jobs/:id/approve`, `GET /health`.
 * Also `POST /jobs/:id/dispatch` (not in the plan's literal route list, but
 * the plan separately asks for a `github` dispatcher — without a route to
 * call it from, that module would be dead code; this is its real entry
 * point).
 *
 * `createApp(deps)` takes every dependency as a plain object (same DI
 * convention `apps/worker`'s commands already use) so this is testable
 * against fakes without a real Supabase/R2/GitHub — `src/index.ts` wires
 * the real ones for the actual server.
 */

const JobResponse = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  manifest: Manifest,
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ErrorResponse = z.object({ error: z.string() });

export type AppDeps = {
  jobsRepo: JobsRepo;
  projectsRepo: ProjectsRepo;
  apiKeysRepo: ApiKeysRepo;
  createStorage: (providerId: string) => StorageProvider;
  dispatcher: Dispatcher;
};

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<{ Variables: AuthVariables }>();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/health',
      responses: {
        200: {
          content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } },
          description: 'OK',
        },
      },
    }),
    (c) => c.json({ status: 'ok' as const }),
  );

  // Everything below requires a valid API key.
  app.use('/jobs', apiKeyAuth(deps.apiKeysRepo));
  app.use('/jobs/*', apiKeyAuth(deps.apiKeysRepo));

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({ projectSlug: z.string().min(1), manifest: Manifest }),
            },
          },
        },
      },
      responses: {
        201: {
          content: { 'application/json': { schema: JobResponse } },
          description: 'Job created',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Project not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { projectSlug, manifest } = c.req.valid('json');
      const project = await deps.projectsRepo.getBySlug(orgId, projectSlug);
      if (!project) return c.json({ error: `No project "${projectSlug}" for this org` }, 404);
      const job = await deps.jobsRepo.create(orgId, project.id, manifest);
      return c.json(job, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/jobs/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { 'application/json': { schema: JobResponse } }, description: 'The job' },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { id } = c.req.valid('param');
      const job = await deps.jobsRepo.getById(id);
      // A job that exists but belongs to another org reads as 404, not
      // 403 — never confirm cross-org existence to a caller who shouldn't
      // be able to see it either way.
      if (!job || job.org_id !== orgId) return c.json({ error: 'Job not found' }, 404);
      return c.json(job, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/jobs',
      request: { query: z.object({ project: z.string().min(1) }) },
      responses: {
        200: {
          content: { 'application/json': { schema: z.array(JobResponse) } },
          description: 'Jobs for the project',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Project not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { project: projectSlug } = c.req.valid('query');
      const project = await deps.projectsRepo.getBySlug(orgId, projectSlug);
      if (!project) return c.json({ error: `No project "${projectSlug}" for this org` }, 404);
      const jobs = await deps.jobsRepo.listByProject(orgId, project.id);
      return c.json(jobs, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs/{id}/assets',
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            'application/json': {
              schema: z.object({ shotId: z.string().min(1), filename: z.string().min(1) }),
            },
          },
        },
      },
      responses: {
        200: {
          content: {
            'application/json': { schema: z.object({ url: z.string(), key: z.string() }) },
          },
          description: 'Presigned upload URL',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { id } = c.req.valid('param');
      const { shotId, filename } = c.req.valid('json');
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) return c.json({ error: 'Job not found' }, 404);
      const project = await deps.projectsRepo.getById(job.project_id);
      if (!project) return c.json({ error: 'Job not found' }, 404);

      const resolvedJob = resolveJob(project.config, job.manifest);
      const storage = deps.createStorage(resolvedJob.providers.storage);
      // Same key convention `ss upload`/`run-job`'s downloadRawClip use —
      // this is the real "presigned PUT via API" path for a browser client
      // that can't hold storage credentials (the dashboard, P5); `ss
      // upload`'s own header explains why the CLI bypasses this and calls
      // `storage.put()` directly instead.
      const key = `jobs/${id}/uploads/${shotId}/${filename}`;
      const url = await storage.presignUpload(key);
      return c.json({ url, key }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs/{id}/approve',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: { 'application/json': { schema: JobResponse } },
          description: 'Approved, now running',
        },
        400: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not awaiting review',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { id } = c.req.valid('param');
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) return c.json({ error: 'Job not found' }, 404);
      if (!job.status.startsWith('awaiting_review:')) {
        return c.json({ error: `Job is "${job.status}", not awaiting review` }, 400);
      }
      assertJobTransition(job.status, 'running');
      await deps.jobsRepo.updateStatus(id, 'running');
      return c.json({ ...job, status: 'running' as JobStatus }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs/{id}/dispatch',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: { 'application/json': { schema: z.object({ dispatched: z.boolean() }) } },
          description: 'Dispatched (or already was)',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not found',
        },
        400: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not queued',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { id } = c.req.valid('param');
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) return c.json({ error: 'Job not found' }, 404);
      if (job.status !== 'queued')
        return c.json({ error: `Job is "${job.status}", not queued` }, 400);
      await deps.dispatcher.dispatch(id);
      return c.json({ dispatched: true }, 200);
    },
  );

  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { title: 'signal-studio engine API', version: '0.1.0' },
  });

  return app;
}
