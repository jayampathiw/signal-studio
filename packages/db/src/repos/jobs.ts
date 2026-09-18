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
}
