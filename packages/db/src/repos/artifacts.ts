import type { SupabaseClient } from '@supabase/supabase-js';

export type ArtifactRow = {
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

export class ArtifactsRepo {
  private client: SupabaseClient;
  private orgId: string;

  constructor(client: SupabaseClient, orgId: string) {
    this.client = client;
    this.orgId = orgId;
  }

  async record(
    jobId: string,
    stageName: string,
    kind: string,
    url: string,
    metadata: Record<string, unknown> = {},
  ): Promise<ArtifactRow> {
    const { data, error } = await this.client
      .from('artifacts')
      .insert({ org_id: this.orgId, job_id: jobId, stage_name: stageName, kind, url, metadata })
      .select()
      .single();
    if (error) throw new Error(`ArtifactsRepo.record: ${error.message}`);
    return data as ArtifactRow;
  }

  async listForJob(jobId: string): Promise<ArtifactRow[]> {
    const { data, error } = await this.client.from('artifacts').select().eq('job_id', jobId);
    if (error) throw new Error(`ArtifactsRepo.listForJob: ${error.message}`);
    return data as ArtifactRow[];
  }
}
