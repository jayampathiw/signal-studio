import { Pack, packToManifest } from '@assemblex/packs/blbl.v1';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { resolveJob } from '@signal-studio/core/resolve';
import { Manifest, Project } from '@signal-studio/core/schemas';
import { assertJobTransition, type JobStatus } from '@signal-studio/core/state';
import type {
  ApiKeysRepo,
  ArtifactsRepo,
  GenerationAttemptsRepo,
  JobsRepo,
  JobStagesRepo,
  ProjectsRepo,
  UserOrgsRepo,
} from '@signal-studio/db/repos';
import type { StorageProvider } from '@signal-studio/providers/contracts';
import { cors } from 'hono/cors';

import type { Dispatcher } from './dispatcher.ts';
import type { Logger } from './logger.ts';
import type { AuthVariables } from './middleware/api-key.ts';
import { combinedAuth, type CombinedAuthDeps } from './middleware/combined-auth.ts';

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

const LogEntryResponse = z.object({
  id: z.union([z.string(), z.number()]),
  stage_name: z.string().nullable(),
  message: z.string(),
  created_at: z.string(),
});

const ProjectResponse = z.object({
  id: z.string(),
  org_id: z.string(),
  slug: z.string(),
  config: Project,
  created_at: z.string(),
  updated_at: z.string(),
});

const ArtifactResponse = z.object({
  id: z.string(),
  org_id: z.string(),
  job_id: z.string(),
  stage_name: z.string(),
  kind: z.string(),
  url: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});

const GenerationAttemptResponse = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string(),
  job_id: z.string().nullable(),
  shot_purpose: z.string(),
  succeeded: z.boolean(),
  note: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
});

const ShotPurposeReportResponse = z.object({
  shot_purpose: z.string(),
  attempts: z.number(),
  succeeded: z.number(),
  failed: z.number(),
});

export type AppDeps = {
  jobsRepo: JobsRepo;
  projectsRepo: ProjectsRepo;
  apiKeysRepo: ApiKeysRepo;
  createStorage: (providerId: string) => StorageProvider;
  dispatcher: Dispatcher;
  // P4.1 addition — one per org, same "factory, not a fixed instance"
  // reasoning `apps/worker`'s own `createArtifactsRepo`/`createStageStore`
  // deps already have (the org isn't known until request time, from
  // `apiKeyAuth` middleware).
  createJobStagesRepo: (orgId: string) => JobStagesRepo;
  // P5.3 addition — same factory-per-request reasoning as
  // `createJobStagesRepo` above; needed for the new
  // `GET /jobs/:id/artifacts` route.
  createArtifactsRepo: (orgId: string) => ArtifactsRepo;
  // P4.3 addition — optional so every existing `createApp(deps)` test
  // fixture (built before this pass) keeps compiling unchanged; real
  // callers (`src/index.ts`) always supply the real pino-backed one.
  logger?: Logger;
  // P4.3 addition — omitted entirely when no Sentry DSN is configured,
  // same "genuinely inactive, not a no-op" convention `apps/worker`'s own
  // `reportError` dep already established.
  reportError?: (err: unknown, context?: Record<string, unknown>) => void;
  // P5.1 addition — the dashboard's own login path, alongside (not
  // replacing) `apiKeysRepo`'s existing CI/automation one. See
  // `combined-auth.ts`'s own header for why org resolution works this way.
  userOrgsRepo: UserOrgsRepo;
  engineSupabaseUrl: string;
  engineSupabaseAnonKey: string;
  authFetchFn?: typeof fetch;
  // P5.6 addition — one per org, same factory reasoning as
  // `createJobStagesRepo`/`createArtifactsRepo` above.
  createGenerationAttemptsRepo: (orgId: string) => GenerationAttemptsRepo;
  // P5.1 addition — see the CORS middleware's own comment in createApp().
  corsOrigins?: string[];
};

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono<{ Variables: AuthVariables & { userId?: string } }>();
  // P5.1 — the dashboard's /engine/* console is the first real browser
  // caller this API has ever had (every prior caller — `ss` CLI,
  // `run-job.yml`, `apps/worker`'s dispatcher — was server-to-server, no
  // browser, no CORS preflight involved). Without this, every real fetch()
  // from the dashboard's own origin fails before even reaching auth.
  // `deps.corsOrigins` defaults to the two real dev origins this repo's
  // `ng serve` and `ss`/curl testing actually use; a real prod origin list
  // needs to be set once the dashboard has a real deploy target (P4.2).
  app.use(
    '*',
    cors({
      origin: deps.corsOrigins ?? ['http://localhost:4200', 'http://localhost:4299'],
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE'],
    }),
  );
  const authDeps: CombinedAuthDeps = {
    apiKeysRepo: deps.apiKeysRepo,
    engineSupabaseUrl: deps.engineSupabaseUrl,
    engineSupabaseAnonKey: deps.engineSupabaseAnonKey,
    userOrgsRepo: deps.userOrgsRepo,
    fetchFn: deps.authFetchFn,
  };
  const logger: Logger = deps.logger ?? {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };

  // P4.3 — every unhandled route error (a thrown `DispatchError`, a
  // Supabase call failing, etc.) previously fell through to Hono's own
  // default 500 with no structured logging at all. Now logged with real
  // request context before still returning the same generic 500 body —
  // never a raw stack trace to the caller.
  app.onError((err, c) => {
    logger.error('unhandled request error', {
      method: c.req.method,
      path: c.req.path,
      error: err instanceof Error ? err.message : String(err),
    });
    deps.reportError?.(err, { method: c.req.method, path: c.req.path });
    return c.json({ error: 'Internal server error' }, 500);
  });

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

  // Everything below requires either an API key or a real Supabase Auth
  // session — see combined-auth.ts's own header.
  app.use('/jobs', combinedAuth(authDeps));
  app.use('/jobs/*', combinedAuth(authDeps));
  app.use('/projects', combinedAuth(authDeps));
  app.use('/projects/*', combinedAuth(authDeps));
  app.use('/generation-attempts', combinedAuth(authDeps));
  app.use('/generation-attempts/*', combinedAuth(authDeps));
  app.use('/me', combinedAuth(authDeps));
  app.use('/manifest/*', combinedAuth(authDeps));

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      responses: {
        200: {
          content: { 'application/json': { schema: z.object({ orgId: z.string() }) } },
          description: 'The resolved org for this credential',
        },
      },
    }),
    (c) => c.json({ orgId: c.get('orgId') }, 200),
  );

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
      path: '/jobs/{id}/log',
      request: {
        params: z.object({ id: z.string() }),
        query: z.object({ tail: z.coerce.number().int().positive().max(500).optional() }),
      },
      responses: {
        200: {
          content: { 'application/json': { schema: z.array(LogEntryResponse) } },
          description: 'The most recent job_log entries, oldest first',
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
      const { tail } = c.req.valid('query');
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) return c.json({ error: 'Job not found' }, 404);
      const entries = await deps.createJobStagesRepo(orgId).listRecent(id, tail ?? 50);
      return c.json(entries, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/jobs/{id}/stages',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: {
            'application/json': {
              schema: z.array(
                z.object({
                  stage_name: z.string(),
                  output_id: z.string(),
                  status: z.string(),
                  warnings: z.array(z.string()).nullable(),
                  started_at: z.string().nullable(),
                  ended_at: z.string().nullable(),
                }),
              ),
            },
          },
          description: "The job's stage timeline, in run order",
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
      const stages = await deps.createJobStagesRepo(orgId).listForJob(id);
      return c.json(stages, 200);
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

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs/{id}/reject',
      request: {
        params: z.object({ id: z.string() }),
        body: {
          content: {
            'application/json': { schema: z.object({ note: z.string().min(1) }) },
          },
        },
      },
      responses: {
        200: { content: { 'application/json': { schema: JobResponse } }, description: 'Rejected' },
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
      const { note } = c.req.valid('json');
      const job = await deps.jobsRepo.getById(id);
      if (!job || job.org_id !== orgId) return c.json({ error: 'Job not found' }, 404);
      if (!job.status.startsWith('awaiting_review:')) {
        return c.json({ error: `Job is "${job.status}", not awaiting review` }, 400);
      }
      assertJobTransition(job.status, 'failed');
      await deps.createJobStagesRepo(orgId).log(id, 'review', `rejected: ${note}`);
      await deps.jobsRepo.updateStatus(id, 'failed');
      return c.json({ ...job, status: 'failed' as JobStatus }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs/{id}/cancel',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { content: { 'application/json': { schema: JobResponse } }, description: 'Cancelled' },
        400: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Cannot cancel from this status',
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
      try {
        assertJobTransition(job.status, 'cancelled');
      } catch {
        return c.json({ error: `Job is "${job.status}", cannot be cancelled` }, 400);
      }
      await deps.jobsRepo.updateStatus(id, 'cancelled');
      return c.json({ ...job, status: 'cancelled' as JobStatus }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs/{id}/retry',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: { 'application/json': { schema: z.object({ dispatched: z.boolean() }) } },
          description: 'Requeued and dispatched',
        },
        400: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not failed',
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
      if (job.status !== 'failed')
        return c.json({ error: `Job is "${job.status}", not failed` }, 400);
      // Same legal path `ss run-job`'s own PATH_TO_RUNNING table already
      // uses for a retried job (`failed -> queued`) — this route just
      // triggers it from the dashboard instead of a CLI re-run, then
      // dispatches immediately rather than leaving it queued for a
      // separate manual dispatch call.
      assertJobTransition(job.status, 'queued');
      await deps.jobsRepo.updateStatus(id, 'queued');
      await deps.dispatcher.dispatch(id);
      return c.json({ dispatched: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/jobs/{id}/queue',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: { 'application/json': { schema: z.object({ dispatched: z.boolean() }) } },
          description: 'Queued and dispatched',
        },
        400: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not created/awaiting_assets',
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
      // **Real gap this route closes, found real-testing P4.2's queue-mode
      // stack, not by inspection**: `POST /jobs` leaves a job at `created`
      // forever — nothing else in this API ever moved it to `queued`, so
      // `/dispatch` (which requires exactly that status) could never
      // legally fire from a real client (the dashboard's own New Job
      // wizard included). Every prior real verification of dispatch in
      // this project went through `ss run-job` directly or manual DB
      // writes, which both bypass this path entirely — this is the first
      // time anything exercised "dashboard creates a job, then asks for it
      // to actually run" end to end.
      if (job.status !== 'created' && job.status !== 'awaiting_assets') {
        return c.json({ error: `Job is "${job.status}", not created/awaiting_assets` }, 400);
      }
      assertJobTransition(job.status, 'queued');
      await deps.jobsRepo.updateStatus(id, 'queued');
      await deps.dispatcher.dispatch(id);
      return c.json({ dispatched: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/jobs/{id}/artifacts',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: {
          content: { 'application/json': { schema: z.array(ArtifactResponse) } },
          description: 'Artifacts for the job',
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
      const artifacts = await deps.createArtifactsRepo(orgId).listForJob(id);
      return c.json(artifacts, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/projects',
      responses: {
        200: {
          content: { 'application/json': { schema: z.array(ProjectResponse) } },
          description: "The org's projects",
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const projects = await deps.projectsRepo.listByOrg(orgId);
      return c.json(projects, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/projects/{slug}',
      request: { params: z.object({ slug: z.string() }) },
      responses: {
        200: {
          content: { 'application/json': { schema: ProjectResponse } },
          description: 'The project',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { slug } = c.req.valid('param');
      const project = await deps.projectsRepo.getBySlug(orgId, slug);
      if (!project) return c.json({ error: 'Project not found' }, 404);
      return c.json(project, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/projects/{slug}',
      request: {
        params: z.object({ slug: z.string() }),
        body: { content: { 'application/json': { schema: Project } } },
      },
      responses: {
        200: {
          content: { 'application/json': { schema: ProjectResponse } },
          description: 'Updated',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { slug } = c.req.valid('param');
      const config = c.req.valid('json');
      const existing = await deps.projectsRepo.getBySlug(orgId, slug);
      if (!existing) return c.json({ error: 'Project not found' }, 404);
      const updated = await deps.projectsRepo.updateConfig(orgId, slug, config);
      return c.json(updated, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/manifest/validate',
      request: {
        body: { content: { 'application/json': { schema: z.unknown() } } },
      },
      responses: {
        200: {
          content: { 'application/json': { schema: z.object({ valid: z.literal(true) }) } },
          description: 'A valid manifest.v1 document',
        },
        400: {
          content: {
            'application/json': {
              schema: z.object({ valid: z.literal(false), issues: z.array(z.unknown()) }),
            },
          },
          description: 'Invalid — see issues',
        },
      },
    }),
    async (c) => {
      const body = await c.req.json();
      const result = Manifest.safeParse(body);
      if (!result.success) {
        return c.json({ valid: false as const, issues: result.error.issues }, 400);
      }
      return c.json({ valid: true as const }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/manifest/from-pack',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({ pack: z.unknown(), projectRef: z.string().min(1) }),
            },
          },
        },
      },
      responses: {
        200: {
          content: { 'application/json': { schema: z.object({ manifest: Manifest }) } },
          description: 'The pack.json converted to a real manifest.v1 document',
        },
        400: {
          content: {
            'application/json': {
              schema: z.object({ error: z.string(), issues: z.array(z.unknown()) }),
            },
          },
          description: "pack.json didn't match the Pack schema",
        },
      },
    }),
    async (c) => {
      const { pack, projectRef } = c.req.valid('json');
      const parsed = Pack.safeParse(pack);
      if (!parsed.success) {
        return c.json({ error: 'Invalid pack.json', issues: parsed.error.issues }, 400);
      }
      const manifest = packToManifest(parsed.data, { projectRef });
      return c.json({ manifest }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/generation-attempts',
      request: {
        body: {
          content: {
            'application/json': {
              schema: z.object({
                projectSlug: z.string().min(1),
                jobId: z.string().optional(),
                shotPurpose: z.string().min(1),
                succeeded: z.boolean(),
                note: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: {
        201: {
          content: { 'application/json': { schema: GenerationAttemptResponse } },
          description: 'Logged',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Project not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const userId = c.get('userId');
      const { projectSlug, jobId, shotPurpose, succeeded, note } = c.req.valid('json');
      const project = await deps.projectsRepo.getBySlug(orgId, projectSlug);
      if (!project) return c.json({ error: `No project "${projectSlug}" for this org` }, 404);
      const attempt = await deps.createGenerationAttemptsRepo(orgId).create(orgId, {
        projectId: project.id,
        jobId,
        shotPurpose,
        succeeded,
        note,
        createdBy: userId,
      });
      return c.json(attempt, 201);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/generation-attempts',
      request: {
        query: z.object({
          project: z.string().min(1),
          days: z.coerce.number().int().positive().max(90).optional(),
        }),
      },
      responses: {
        200: {
          content: { 'application/json': { schema: z.array(ShotPurposeReportResponse) } },
          description: 'Weekly (or custom-window) failure report by shot purpose',
        },
        404: {
          content: { 'application/json': { schema: ErrorResponse } },
          description: 'Project not found',
        },
      },
    }),
    async (c) => {
      const orgId = c.get('orgId');
      const { project: projectSlug, days } = c.req.valid('query');
      const project = await deps.projectsRepo.getBySlug(orgId, projectSlug);
      if (!project) return c.json({ error: `No project "${projectSlug}" for this org` }, 404);
      const report = await deps
        .createGenerationAttemptsRepo(orgId)
        .weeklyReport(orgId, project.id, days ?? 7);
      return c.json(report, 200);
    },
  );

  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { title: 'signal-studio engine API', version: '0.1.0' },
  });

  return app;
}
