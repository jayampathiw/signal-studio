// Higgsfield CLI wrapper for the long-form pool. Submits a job (without --wait)
// to capture its id, then polls to completion — the shape the rolling pool needs.
//
// Overflow past the 8-concurrent ceiling is REJECTED with `rate_limit_reached`
// (docs/long-form-pipeline-plan.md §7a spike), NOT queued — so submit() treats
// that as a transient back-off + retry, never a job failure.

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const WORKSPACE_ID = process.env.HIGGSFIELD_WORKSPACE_ID || 'd5847cc9-7c8b-4bca-aa5f-6cb6bb6b5ea6';

let _workspaceReady = false;
async function ensureWorkspace() {
  if (_workspaceReady) return;
  await execFileAsync('higgsfield', ['workspace', 'set', WORKSPACE_ID]).catch(() => {});
  _workspaceReady = true;
}

async function hf(args) {
  const { stdout } = await execFileAsync('higgsfield', [...args, '--json'], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

// `higgsfield generate create` prints the rate-limit body to stderr and exits
// non-zero; detect it from the thrown error so we can back off instead of fail.
function isRateLimit(err) {
  const blob = `${err?.stdout ?? ''}${err?.stderr ?? ''}${err?.message ?? ''}`;
  return /rate_limit_reached|concurrent_jobs_limit/i.test(blob);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Build `--name value` CLI args from a params object (skips null/undefined).
 *  Array values emit one --flag per element (e.g. image_references). */
function paramArgs(params) {
  const out = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) out.push(`--${k}`, String(item));
    } else {
      out.push(`--${k}`, String(v));
    }
  }
  return out;
}

/**
 * Submit a generation job, retrying on rate-limit back-off. Returns the job id.
 * @param {string} jobType
 * @param {Record<string, string|number|boolean>} params  includes `prompt`, optional `image` (reference id/path)
 */
export async function submit(jobType, params, { maxRateLimitRetries = 40, backoffMs = 8000 } = {}) {
  await ensureWorkspace();
  for (let attempt = 0; ; attempt++) {
    try {
      const job = await hf(['generate', 'create', jobType, ...paramArgs(params)]);
      // `generate create` returns a bare array of job ids, e.g. ["<uuid>"];
      // some paths return an object with an id — handle both.
      const id = Array.isArray(job)
        ? typeof job[0] === 'string'
          ? job[0]
          : job[0]?.id
        : (job.id ?? job.job_id ?? job.jobs?.[0]?.id);
      if (!id)
        throw new Error(`submit: no job id in response: ${JSON.stringify(job).slice(0, 200)}`);
      return id;
    } catch (err) {
      if (isRateLimit(err) && attempt < maxRateLimitRetries) {
        await sleep(backoffMs);
        continue; // transient — a slot will free up; not a failure
      }
      throw new Error(
        `Higgsfield submit(${jobType}) failed: ${(err.stderr || err.message || '').slice(0, 300)}`,
      );
    }
  }
}

/**
 * Poll a job until terminal. Resolves { status, url } or throws on failure/timeout.
 * @param {string} jobId
 */
export async function poll(jobId, { timeoutMs = 15 * 60 * 1000, intervalMs = 8000 } = {}) {
  await ensureWorkspace();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let job;
    try {
      job = await hf(['generate', 'get', jobId]);
    } catch (err) {
      if (Date.now() > deadline)
        throw new Error(`poll(${jobId}) timed out (get failed): ${err.message}`);
      await sleep(intervalMs);
      continue;
    }
    const status = job.status;
    if (status === 'completed')
      return { status, url: job.result_url ?? job.min_result_url ?? null };
    if (status === 'failed' || status === 'nsfw' || status === 'canceled') {
      throw new Error(`job ${jobId} ${status}: ${job.error ?? job.fail_reason ?? 'no reason'}`);
    }
    if (Date.now() > deadline) throw new Error(`poll(${jobId}) timed out in status "${status}"`);
    await sleep(intervalMs);
  }
}

/** Submit + poll in one call. Returns { jobId, url }. */
export async function generate(jobType, params, opts = {}) {
  const jobId = await submit(jobType, params, opts);
  const { url } = await poll(jobId, opts);
  return { jobId, url };
}

export default { submit, poll, generate };
