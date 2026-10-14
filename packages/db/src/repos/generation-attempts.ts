import type { SupabaseClient } from '@supabase/supabase-js';

export type GenerationAttemptRow = {
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

/**
 * P5.6 — the real table behind the dashboard's "log attempt" form, replacing
 * `production-log.csv`. `weeklyReport` groups every attempt in the last
 * `days` days by `shot_purpose` — done in JS, not a SQL `group by`, since
 * this repo (like every other one in this package) only ever gets a plain
 * `SupabaseClient`, not a raw Postgres connection to run arbitrary
 * aggregate SQL against; the row counts here are small enough (per-org,
 * per-week) that this isn't a real performance concern.
 */
export class GenerationAttemptsRepo {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async create(
    orgId: string,
    args: {
      projectId: string;
      jobId?: string;
      shotPurpose: string;
      succeeded: boolean;
      note?: string;
      createdBy?: string;
    },
  ): Promise<GenerationAttemptRow> {
    const { data, error } = await this.client
      .from('generation_attempts')
      .insert({
        org_id: orgId,
        project_id: args.projectId,
        job_id: args.jobId ?? null,
        shot_purpose: args.shotPurpose,
        succeeded: args.succeeded,
        note: args.note ?? null,
        created_by: args.createdBy ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`GenerationAttemptsRepo.create: ${error.message}`);
    return data as GenerationAttemptRow;
  }

  async weeklyReport(orgId: string, projectId: string, days = 7): Promise<ShotPurposeReportRow[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.client
      .from('generation_attempts')
      .select('shot_purpose, succeeded')
      .eq('org_id', orgId)
      .eq('project_id', projectId)
      .gte('created_at', since);
    if (error) throw new Error(`GenerationAttemptsRepo.weeklyReport: ${error.message}`);

    const byPurpose = new Map<string, ShotPurposeReportRow>();
    for (const row of data as Array<{ shot_purpose: string; succeeded: boolean }>) {
      const entry = byPurpose.get(row.shot_purpose) ?? {
        shot_purpose: row.shot_purpose,
        attempts: 0,
        succeeded: 0,
        failed: 0,
      };
      entry.attempts += 1;
      if (row.succeeded) entry.succeeded += 1;
      else entry.failed += 1;
      byPurpose.set(row.shot_purpose, entry);
    }
    return [...byPurpose.values()].sort((a, b) => b.failed - a.failed);
  }
}
