import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManifestT } from '@signal-studio/core/schemas';
import type { JobStatus } from '@signal-studio/core/state';

export type JobRow = {
  id: string;
  org_id: string;
  project_id: string;
  manifest: ManifestT;
  status: JobStatus;
  created_at: string;
  updated_at: string;
};

export class JobsRepo {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async create(orgId: string, projectId: string, manifest: ManifestT): Promise<JobRow> {
    const { data, error } = await this.client
      .from('jobs')
      .insert({ org_id: orgId, project_id: projectId, manifest, status: 'created' })
      .select()
      .single();
    if (error) throw new Error(`JobsRepo.create: ${error.message}`);
    return data as JobRow;
  }

  async updateStatus(jobId: string, status: JobStatus): Promise<void> {
    const { error } = await this.client
      .from('jobs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) throw new Error(`JobsRepo.updateStatus: ${error.message}`);
  }

  async getById(jobId: string): Promise<JobRow | null> {
    const { data, error } = await this.client.from('jobs').select().eq('id', jobId).maybeSingle();
    if (error) throw new Error(`JobsRepo.getById: ${error.message}`);
    return data as JobRow | null;
  }

  // P2.7 addition: `GET /jobs?project=` needs to list every job for one
  // project, scoped to the caller's org (API-key auth resolves org_id, never
  // trusts a caller-supplied one) — no lookup here did that before.
  async listByProject(orgId: string, projectId: string): Promise<JobRow[]> {
    const { data, error } = await this.client
      .from('jobs')
      .select()
      .eq('org_id', orgId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`JobsRepo.listByProject: ${error.message}`);
    return data as JobRow[];
  }

  // P2.7 addition: the `github` dispatcher's own "sets `dispatched`
  // atomically" requirement — a plain `updateStatus` can't express "only if
  // still `queued`", which matters once more than one dispatcher instance
  // could race on the same job. Returns whether *this* call won the race.
  async markDispatched(jobId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('jobs')
      .update({ status: 'dispatched', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('status', 'queued')
      .select('id');
    if (error) throw new Error(`JobsRepo.markDispatched: ${error.message}`);
    return (data as unknown[]).length > 0;
  }
}
