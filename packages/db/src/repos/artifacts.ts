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

  // P5.3 fix — real bug found wiring the Jobs detail page's artifact
  // preview, not by inspection: this never filtered by `org_id` at all, so
  // any caller holding a service-role client (every real caller in this
  // repo — `apps/worker`, `apps/api`) could read another org's artifacts
  // by simply guessing/enumerating a `job_id`, since RLS never applies to
  // the service-role key that reaches this class. `record()` already takes
  // `orgId` at construction for exactly this reason; `listForJob` just
  // never used it.
  async listForJob(jobId: string): Promise<ArtifactRow[]> {
    const { data, error } = await this.client
      .from('artifacts')
      .select()
      .eq('org_id', this.orgId)
      .eq('job_id', jobId);
    if (error) throw new Error(`ArtifactsRepo.listForJob: ${error.message}`);
    return data as ArtifactRow[];
  }
}
