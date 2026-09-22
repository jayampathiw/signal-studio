import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobStageStore, StageRunRecord } from '@signal-studio/core/runner';

/**
 * Implements @signal-studio/core's JobStageStore contract against the
 * `job_stages` / `job_log` tables — this is the thing the stage runner
 * (P1.3) is injected with in production; tests inject an in-memory fake
 * instead (packages/core/src/runner/runner.test.ts).
 */
export class JobStagesRepo implements JobStageStore {
  private client: SupabaseClient;
  private orgId: string;

  // orgId is fixed per instance (one JobStagesRepo per resolved job) since
  // job_stages.org_id is NOT NULL and JobStageStore's interface — shared
  // with the in-memory test fake in packages/core — doesn't carry it
  // through every call.
  constructor(client: SupabaseClient, orgId: string) {
    this.client = client;
    this.orgId = orgId;
  }

  async getLastRun(
    jobId: string,
    stageName: string,
    outputId?: string,
  ): Promise<StageRunRecord | null> {
    let query = this.client
      .from('job_stages')
      .select('inputs_hash, status, outputs')
      .eq('job_id', jobId)
      .eq('stage_name', stageName);
    query = outputId ? query.eq('output_id', outputId) : query.is('output_id', null);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`JobStagesRepo.getLastRun: ${error.message}`);
    if (!data) return null;
    // P2.5: `outputs` travels back through here too — a skip (unchanged
    // hash) now hands the caller the same outputs a fresh run would have,
    // per `StageRunner.run()`'s own doc comment.
    return {
      hash: data.inputs_hash,
      status: data.status as StageRunRecord['status'],
      outputs: data.outputs ?? undefined,
    };
  }

  async recordStart(jobId: string, stageName: string, outputId?: string): Promise<void> {
    const { error } = await this.client.from('job_stages').upsert(
      {
        org_id: this.orgId,
        job_id: jobId,
        stage_name: stageName,
        output_id: outputId ?? null,
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'job_id,stage_name,output_id' },
    );
    if (error) throw new Error(`JobStagesRepo.recordStart: ${error.message}`);
  }

  async recordEnd(
    jobId: string,
    stageName: string,
    result: { hash: string; status: 'done' | 'failed'; outputs?: unknown; warnings?: string[] },
    outputId?: string,
  ): Promise<void> {
    const { error } = await this.client.from('job_stages').upsert(
      {
        org_id: this.orgId,
        job_id: jobId,
        stage_name: stageName,
        output_id: outputId ?? null,
        status: result.status,
        inputs_hash: result.hash,
        outputs: result.outputs ?? null,
        warnings: result.warnings ?? null,
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'job_id,stage_name,output_id' },
    );
    if (error) throw new Error(`JobStagesRepo.recordEnd: ${error.message}`);
  }

  async log(jobId: string, stageName: string, message: string): Promise<void> {
    const { error } = await this.client
      .from('job_log')
      .insert({ org_id: this.orgId, job_id: jobId, stage_name: stageName, message });
    if (error) throw new Error(`JobStagesRepo.log: ${error.message}`);
  }
}
