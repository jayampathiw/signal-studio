import type { ManifestT } from '@signal-studio/core/schemas';
import type { JobStatus } from '@signal-studio/core/state';
import type { SupabaseClient } from '@supabase/supabase-js';

export type JobRow = {
  id: string;
  org_id: string;
  project_id: string;
  manifest: ManifestT;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  // P4.1 addition — `ss worker`'s own liveness signal, touched every ~30s
  // while a job is actively processing. Null until the first heartbeat.
  heartbeat_at: string | null;
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

  // P4.1 addition — `ss worker`'s own periodic liveness ping while a job is
  // actively `running`. Deliberately does NOT bump `updated_at` (unlike
  // `updateStatus`) — `updated_at` means "the job's own state changed,"
  // which a heartbeat isn't; keeping them separate means a dashboard/API
  // consumer sorting or diffing on `updated_at` doesn't see a real
  // in-progress job "changing" every 30 seconds for no substantive reason.
  async heartbeat(jobId: string): Promise<void> {
    const { error } = await this.client
      .from('jobs')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', jobId);
    if (error) throw new Error(`JobsRepo.heartbeat: ${error.message}`);
  }

  // P4.1 addition — the reaper's own query: any job still `running` whose
  // heartbeat has gone stale (its worker crashed, was OOM-killed, or the
  // host rebooted mid-job, with no chance to mark its own job `failed`)
  // gets marked `failed` here. Scoped to `heartbeat_at is not null` — a job
  // that transitioned to `running` but hasn't had its first heartbeat tick
  // yet (a real, brief window right at job start) has no heartbeat to be
  // stale, and reaping it on that technicality would be a false positive,
  // not a real hang. Returns the reaped rows so the caller can log exactly
  // which jobs it touched, not just a count.
  async reapStaleRunning(staleBefore: Date): Promise<JobRow[]> {
    const { data, error } = await this.client
      .from('jobs')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('status', 'running')
      .not('heartbeat_at', 'is', null)
      .lt('heartbeat_at', staleBefore.toISOString())
      .select();
    if (error) throw new Error(`JobsRepo.reapStaleRunning: ${error.message}`);
    return data as JobRow[];
  }

  // P4.3 addition — the daily digest's own counts. Three real head-count
  // queries rather than one `select('status')` over every row: exact and
  // cheap at any real table size (a `head: true` count never transfers row
  // data), and `awaiting_review` is a *family* of statuses
  // (`awaiting_review:<gate>`, per `packages/core/src/state`'s own
  // comment) that a single `.eq('status', ...)` can't match — needs `like`.
  async countsByStatus(
    orgId: string,
  ): Promise<{ failed: number; awaitingReview: number; delivered: number }> {
    const base = () =>
      this.client.from('jobs').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const countOf = async (apply: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
      const { count, error } = await apply(base());
      if (error) throw new Error(`JobsRepo.countsByStatus: ${error.message}`);
      return count ?? 0;
    };

    const [failed, awaitingReview, delivered] = await Promise.all([
      countOf((q) => q.eq('status', 'failed')),
      countOf((q) => q.like('status', 'awaiting_review:%')),
      countOf((q) => q.eq('status', 'delivered')),
    ]);
    return { failed, awaitingReview, delivered };
  }
}
