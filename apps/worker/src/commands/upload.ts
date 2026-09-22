import path from 'node:path';

import { resolveJob } from '@signal-studio/core/resolve';
import type { ArtifactsRepo, JobsRepo, ProjectsRepo } from '@signal-studio/db/repos';
import type { StorageProvider } from '@signal-studio/providers/contracts';

import type { Logger } from '../logger.ts';

/**
 * P2.5 — `ss upload --job --shot --file`: puts a shot's raw clip into
 * storage under the `jobs/<jobId>/uploads/<shotId>/<filename>` key
 * convention `run-job.ts`'s `downloadRawClip()` reads back.
 *
 * **Deliberate deviation from the plan's literal bullet, flagged rather than
 * silently resolved**: the plan says "presigned PUT via API" — but
 * `apps/api` (P2.7) doesn't exist yet, and a presigned-PUT round-trip only
 * matters for a *browser* client that can't hold storage credentials
 * (the dashboard, P5). This CLI already runs with real credentials and has
 * the file on local disk, so it calls `storage.put()` directly — the
 * correct, simpler call for a trusted local caller, not a workaround. Once
 * P2.7's API exists, the dashboard's upload flow will use its presign
 * endpoint instead; this command's job (getting bytes into storage at the
 * right key, for `run-job` to find) doesn't change either way.
 */

export type UploadOptions = {
  jobId: string;
  shotId: string;
  filePath: string;
};

export type UploadDeps = {
  jobsRepo: JobsRepo;
  projectsRepo: ProjectsRepo;
  createArtifactsRepo: (orgId: string) => ArtifactsRepo;
  createStorage: (providerId: string) => StorageProvider;
};

export async function uploadCommand(
  opts: UploadOptions,
  deps: UploadDeps,
  logger: Logger,
): Promise<void> {
  const job = await deps.jobsRepo.getById(opts.jobId);
  if (!job) throw new Error(`upload: no job found with id "${opts.jobId}"`);

  const projectRow = await deps.projectsRepo.getById(job.project_id);
  if (!projectRow) {
    throw new Error(`upload: job "${job.id}" references missing project_id "${job.project_id}"`);
  }

  const resolvedJob = resolveJob(projectRow.config, job.manifest);
  const storage = deps.createStorage(resolvedJob.providers.storage);

  const filename = path.basename(opts.filePath);
  const key = `jobs/${opts.jobId}/uploads/${opts.shotId}/${filename}`;
  const { url } = await storage.put({ localPath: opts.filePath, key });
  await deps
    .createArtifactsRepo(job.org_id)
    .record(opts.jobId, 'upload', 'raw-clip', url, { shotId: opts.shotId });

  logger.info('uploaded', { key, url });
}
