// Cloudflare Workers AI provider adapter for Seedance 2.0 Mini.
// Exports the same { submit, poll, generate } interface as higgsfield.js
// so the pool and callers are provider-agnostic.
//
// Cloudflare video generation is synchronous for short clips (response body
// is binary video/mp4). If the API returns a JSON task ID instead (async path),
// poll() falls through to the task-status endpoint. Both paths resolve to an R2
// URL so the caller never holds a Cloudflare-scoped reference.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const CF_BASE = 'https://api.cloudflare.com/client/v4';
const MODEL = '@bytedance/seedance-2.0-mini';
const MAX_DURATION = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In-memory map: localJobId → { url } | { taskId }
const _jobs = new Map();

function cfHeaders() {
  const token = process.env.CF_API_TOKEN;
  if (!token) throw new Error('CF_API_TOKEN is not set');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function accountId() {
  const id = process.env.CF_ACCOUNT_ID;
  if (!id) throw new Error('CF_ACCOUNT_ID is not set');
  return id;
}

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadBufferToR2(buffer, key) {
  const bucket = process.env.R2_BUCKET_RENDERED;
  await r2Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: 'video/mp4',
  }));
  return `${process.env.R2_PUBLIC_BASE_URL}/${key}`;
}

/**
 * Submit a Cloudflare Seedance 2.0 Mini video generation job.
 *
 * @param {string} _jobType  ignored (always 'seedance_2_0_mini'); kept for interface compat
 * @param {{ prompt: string, duration_sec: number, reference_urls?: string[], projectId: number|string, sceneN: number|string }} params
 * @returns {Promise<string>} local job ID (UUID)
 */
export async function submit(_jobType, params, { timeoutMs = 5 * 60 * 1000 } = {}) {
  const { prompt, duration_sec, reference_urls = [], projectId, sceneN } = params;

  const body = {
    prompt,
    duration: Math.min(Math.round(duration_sec), MAX_DURATION),
    resolution: '720p',
    aspect_ratio: '16:9',
    generate_audio: false,
  };
  if (reference_urls.length > 0) {
    body.reference_images = reference_urls.slice(0, 4);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(
      `${CF_BASE}/accounts/${accountId()}/ai/run/${MODEL}`,
      { method: 'POST', headers: cfHeaders(), body: JSON.stringify(body), signal: controller.signal },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloudflare submit failed ${res.status}: ${text.slice(0, 300)}`);
  }

  const jobId = randomUUID();
  const contentType = res.headers.get('content-type') ?? '';

  if (contentType.startsWith('video/')) {
    // Synchronous path — response IS the video
    const buf = Buffer.from(await res.arrayBuffer());
    const r2Key = `longform/${projectId}/clips/S${sceneN}.mp4`;
    const url = await uploadBufferToR2(buf, r2Key);
    _jobs.set(jobId, { url });
  } else {
    // Async path — expect JSON with a task id
    const json = await res.json();
    const taskId = json?.result?.id ?? json?.id;
    if (!taskId) throw new Error(`Cloudflare: no task ID in response: ${JSON.stringify(json).slice(0, 200)}`);
    _jobs.set(jobId, { taskId, projectId, sceneN });
  }

  return jobId;
}

/**
 * Poll until the job is complete. For sync-path jobs (already resolved in submit),
 * this returns immediately.
 *
 * @param {string} jobId
 * @returns {Promise<{ status: 'completed', url: string }>}
 */
export async function poll(jobId, { timeoutMs = 5 * 60 * 1000, intervalMs = 8000 } = {}) {
  const entry = _jobs.get(jobId);
  if (!entry) throw new Error(`poll: unknown jobId ${jobId}`);

  // Already resolved synchronously
  if (entry.url) return { status: 'completed', url: entry.url };

  // Async task polling
  const { taskId, projectId, sceneN } = entry;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const res = await fetch(
      `${CF_BASE}/accounts/${accountId()}/ai/tasks/${taskId}`,
      { headers: cfHeaders() },
    );
    if (!res.ok) {
      if (Date.now() > deadline) throw new Error(`poll(${jobId}) timed out (tasks API error ${res.status})`);
      await sleep(intervalMs);
      continue;
    }

    const json = await res.json();
    const status = json?.result?.status ?? json?.status;

    if (status === 'succeeded' || status === 'completed') {
      const videoUrl = json?.result?.output ?? json?.output;
      if (!videoUrl) throw new Error(`Cloudflare task ${taskId} succeeded but has no output URL`);
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error(`Failed to fetch Cloudflare output: ${videoRes.status}`);
      const buf = Buffer.from(await videoRes.arrayBuffer());
      const r2Key = `longform/${projectId}/clips/S${sceneN}.mp4`;
      const url = await uploadBufferToR2(buf, r2Key);
      _jobs.set(jobId, { url });
      return { status: 'completed', url };
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(`Cloudflare task ${taskId} failed: ${JSON.stringify(json?.result ?? json).slice(0, 200)}`);
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
