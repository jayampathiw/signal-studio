import type { JobStageStore, StageRunRecord } from '@signal-studio/core/runner';
import type { SupabaseClient } from '@supabase/supabase-js';

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
    // P2.8 fix: `output_id` is `NOT NULL DEFAULT ''` now (see
    // 20260922100000_job_stages_output_id_not_null.sql for why plain `NULL`
    // never actually worked here) — `''` for "no output", matching the
    // convention the JS side (`StageRunner`, the in-memory test fake)
    // already used everywhere else.
    const { data, error } = await this.client
      .from('job_stages')
      .select('inputs_hash, status, outputs')
      .eq('job_id', jobId)
      .eq('stage_name', stageName)
      .eq('output_id', outputId ?? '')
      .maybeSingle();
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
        output_id: outputId ?? '',
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
        output_id: outputId ?? '',
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

  // P4.3 addition — the real read side of `log()`, for the API's own
  // `GET /jobs/:id/log?tail=N` endpoint. Fetches the `tail` most recent
  // rows (newest first, cheapest for the DB to answer), then reverses them
  // before returning — a human tailing a job's log wants chronological
  // order, the same as `tail -f` would show.
  async listRecent(
    jobId: string,
    tail: number,
  ): Promise<
    Array<{ id: string | number; stage_name: string | null; message: string; created_at: string }>
  > {
    const { data, error } = await this.client
      .from('job_log')
      .select('id, stage_name, message, created_at')
      .eq('org_id', this.orgId)
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(tail);
    if (error) throw new Error(`JobStagesRepo.listRecent: ${error.message}`);
    return (
      data as Array<{
        id: string | number;
        stage_name: string | null;
        message: string;
        created_at: string;
      }>
    ).reverse();
  }
}
