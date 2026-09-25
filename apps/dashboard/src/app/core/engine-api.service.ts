import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { EngineAuthService } from './engine-auth.service';

export type EngineJob = {
  id: string;
  org_id: string;
  project_id: string;
  manifest: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  heartbeat_at?: string | null;
};

export type EngineProject = {
  id: string;
  org_id: string;
  slug: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EngineArtifact = {
  id: string;
  org_id: string;
  job_id: string;
  stage_name: string;
  kind: string;
  url: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EngineLogEntry = {
  id: string | number;
  stage_name: string | null;
  message: string;
  created_at: string;
};

export type EngineStage = {
  stage_name: string;
  output_id: string;
  status: string;
  warnings: string[] | null;
  started_at: string | null;
  ended_at: string | null;
};

export type GenerationAttempt = {
  id: string;
  org_id: string;
  project_id: string;
  job_id: string | null;
  shot_purpose: string;
  succeeded: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type ShotPurposeReportRow = {
  shot_purpose: string;
  attempts: number;
  succeeded: number;
  failed: number;
};

export class EngineApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EngineApiError';
  }
}

/**
 * P5.1 — the dashboard's ONLY way to read or write `jobs`/`projects`/
 * artifacts/generation-attempts. Every call attaches a real Supabase
 * session token as `Authorization: Bearer` (see `EngineAuthService`); the
 * server (apps/api) resolves org scope itself — this client never sends
 * an org id.
 */
@Injectable({ providedIn: 'root' })
export class EngineApiService {
  constructor(private auth: EngineAuthService) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.auth.getAccessToken();
    const res = await fetch(`${environment.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new EngineApiError(res.status, body.error ?? `Request failed (${res.status})`);
    }
    return res.json();
  }

  me(): Promise<{ orgId: string }> {
    return this.request('/me');
  }

  // ── Projects ──────────────────────────────────────────────────────────
  listProjects(): Promise<EngineProject[]> {
    return this.request('/projects');
  }

  getProject(slug: string): Promise<EngineProject> {
    return this.request(`/projects/${encodeURIComponent(slug)}`);
  }

  updateProject(slug: string, config: Record<string, unknown>): Promise<EngineProject> {
    return this.request(`/projects/${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    });
  }

  // ── Jobs ──────────────────────────────────────────────────────────────
  listJobs(projectSlug: string): Promise<EngineJob[]> {
    return this.request(`/jobs?project=${encodeURIComponent(projectSlug)}`);
  }

  getJob(id: string): Promise<EngineJob> {
    return this.request(`/jobs/${id}`);
  }

  getJobLog(id: string, tail = 50): Promise<EngineLogEntry[]> {
    return this.request(`/jobs/${id}/log?tail=${tail}`);
  }

  getJobStages(id: string): Promise<EngineStage[]> {
    return this.request(`/jobs/${id}/stages`);
  }

  getJobArtifacts(id: string): Promise<EngineArtifact[]> {
    return this.request(`/jobs/${id}/artifacts`);
  }

  createJob(projectSlug: string, manifest: Record<string, unknown>): Promise<EngineJob> {
    return this.request('/jobs', {
      method: 'POST',
      body: JSON.stringify({ projectSlug, manifest }),
    });
  }

  validateManifest(
    manifest: Record<string, unknown>,
  ): Promise<{ valid: true } | { valid: false; issues: unknown[] }> {
    return this.request('/manifest/validate', { method: 'POST', body: JSON.stringify(manifest) });
  }

  manifestFromPack(
    pack: Record<string, unknown>,
    projectRef: string,
  ): Promise<{ manifest: Record<string, unknown> }> {
    return this.request('/manifest/from-pack', {
      method: 'POST',
      body: JSON.stringify({ pack, projectRef }),
    });
  }

  presignUpload(
    jobId: string,
    shotId: string,
    filename: string,
  ): Promise<{ url: string; key: string }> {
    return this.request(`/jobs/${jobId}/assets`, {
      method: 'POST',
      body: JSON.stringify({ shotId, filename }),
    });
  }

  approveJob(id: string): Promise<EngineJob> {
    return this.request(`/jobs/${id}/approve`, { method: 'POST' });
  }

  rejectJob(id: string, note: string): Promise<EngineJob> {
    return this.request(`/jobs/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) });
  }

  cancelJob(id: string): Promise<EngineJob> {
    return this.request(`/jobs/${id}/cancel`, { method: 'POST' });
  }

  retryJob(id: string): Promise<{ dispatched: boolean }> {
    return this.request(`/jobs/${id}/retry`, { method: 'POST' });
  }

  dispatchJob(id: string): Promise<{ dispatched: boolean }> {
    return this.request(`/jobs/${id}/dispatch`, { method: 'POST' });
  }

  // ── Generation attempts ──────────────────────────────────────────────
  logGenerationAttempt(args: {
    projectSlug: string;
    jobId?: string;
    shotPurpose: string;
    succeeded: boolean;
    note?: string;
  }): Promise<GenerationAttempt> {
    return this.request('/generation-attempts', { method: 'POST', body: JSON.stringify(args) });
  }

  generationAttemptsReport(projectSlug: string, days = 7): Promise<ShotPurposeReportRow[]> {
    return this.request(
      `/generation-attempts?project=${encodeURIComponent(projectSlug)}&days=${days}`,
    );
  }
}
