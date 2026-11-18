import type { PublishProvider, PublishResultT } from './contracts.ts';

const FB_API = 'https://graph.facebook.com/v22.0';
const FB_RUPLOAD = 'https://rupload.facebook.com/video-upload/v22.0';

/**
 * P3.5 — Facebook Page video publish, real Graph API v22.0 call (per
 * `CLAUDE.md`'s own standing rule — v19 deprecated May 2026). Rewritten
 * clean against the `PublishProvider` contract rather than ported from
 * `apps/video/src/publishers/facebook.js` — that file *is* the caption
 * source of the live bug `CLAUDE.md`'s "Known gotchas" section documents
 * (reads a DB row's `seo`/`ai_caption` fields, one of which doesn't match
 * what `packages/publishers/facebook.js` actually reads — "publishing a
 * Wild Eye reel today posts a blank caption"). This provider takes
 * `caption` as a plain argument instead, already resolved by its caller
 * from `manifest.v1`'s own `captions.facebook`/`hashtags_facebook` fields —
 * there's no second, ambiguous caption source left to drift out of sync
 * with, fixing that whole bug class by construction rather than patching
 * the old field lookup.
 *
 * `pageRef` is the project's per-page env-key suffix (`project.yaml`'s own
 * convention, `FB_PAGE_ID_<pageRef>`/`FB_ACCESS_TOKEN_<pageRef>` — same
 * "per-project page token env name" the plan asks for), not the numeric
 * page id itself.
 *
 * **Reels + AI label**: a video that fits Reels (`args.reel`) goes through
 * the Reels Publishing API (start → upload by URL on `rupload` → finish),
 * whose finish step takes `is_ai_generated` — the label the owner used to
 * set by hand in Meta Business Suite. The plain `/videos` endpoint has no
 * such field, so any other video posts there without it.
 *
 * Reels are never scheduled on Facebook (`video_state=SCHEDULED` with
 * `scheduled_publish_time`), and never uploaded ahead of time: the worker
 * holds a reel with a publish time at `awaiting_publish_time` and calls
 * `post()` once it has passed. A reel counts as posted only once its status
 * reads `publish_status: published`.
 */
export function createFacebookPublishProvider(opts?: {
  pageIdEnvPrefix?: string;
  tokenEnvPrefix?: string;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
  // Reels processing is polled after finish; tests shrink the wait.
  sleep?: (ms: number) => Promise<void>;
  pollAttempts?: number;
}): PublishProvider {
  const env = opts?.env ?? process.env;
  const pageIdPrefix = opts?.pageIdEnvPrefix ?? 'FB_PAGE_ID_';
  const tokenPrefix = opts?.tokenEnvPrefix ?? 'FB_ACCESS_TOKEN_';
  const fetchFn = opts?.fetchFn ?? fetch;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollAttempts = opts?.pollAttempts ?? 30;

  const page = (pageRef: string) => {
    const pageId = env[`${pageIdPrefix}${pageRef}`];
    const token = env[`${tokenPrefix}${pageRef}`];
    if (!pageId || !token) {
      throw new Error(
        `createFacebookPublishProvider: missing ${pageIdPrefix}${pageRef} / ${tokenPrefix}${pageRef}`,
      );
    }
    return { pageId, token, fetchFn, sleep, pollAttempts };
  };

  return {
    async post(args): Promise<PublishResultT> {
      const pg = page(args.pageRef);
      const { pageId, token } = pg;

      if (args.reel) {
        if (args.scheduleAt) {
          throw new Error(
            'Facebook reels are not scheduled on Facebook: hold the job and post at the publish time',
          );
        }
        return publishReel(pg, args);
      }

      const params = new URLSearchParams({
        file_url: args.video,
        description: args.caption,
        access_token: token,
      });
      if (args.title) params.set('title', args.title);
      if (args.scheduleAt) {
        // Graph API's scheduled-publish convention: post unpublished, with
        // a future scheduled_publish_time (unix seconds) — it goes live on
        // its own at that time, this call never re-fires.
        const when = Math.floor(new Date(args.scheduleAt).getTime() / 1000);
        params.set('published', 'false');
        params.set('scheduled_publish_time', String(when));
      }

      const res = await fetchFn(`${FB_API}/${pageId}/videos`, { method: 'POST', body: params });
      if (!res.ok) {
        throw new Error(`Facebook publish failed (${res.status}): ${await res.text()}`);
      }
      const data = (await res.json()) as { id: string };
      return { postId: data.id, url: `https://www.facebook.com/${data.id}` };
    },
  };
}

type PostArgs = Parameters<PublishProvider['post']>[0];

type Page = {
  pageId: string;
  token: string;
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  pollAttempts: number;
};

export class FacebookApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;
  constructor(message: string, status: number, code?: number, subcode?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.subcode = subcode;
  }
}

function reelCall(fetchFn: typeof fetch) {
  return async (step: string, url: string, init: RequestInit) => {
    const res = await fetchFn(url, init);
    if (!res.ok) {
      const body = await res.text();
      let fbError: { code?: number; error_subcode?: number } = {};
      try {
        fbError = (JSON.parse(body) as { error?: typeof fbError }).error ?? {};
      } catch {
        // not JSON; the raw body is in the message
      }
      throw new FacebookApiError(
        `Facebook reel ${step} failed (${res.status}): ${body}`,
        res.status,
        fbError.code,
        fbError.error_subcode,
      );
    }
    return (await res.json()) as Record<string, unknown>;
  };
}

// Finish refused because Facebook no longer has the uploaded file.
const isUploadMissing = (err: unknown) =>
  err instanceof FacebookApiError && err.code === 6000 && err.subcode === 1363130;

async function publishReel(p: Page, args: PostArgs): Promise<PublishResultT> {
  // A retry after finish already went through: only confirm it went live,
  // never post a second copy.
  if (args.finishedVideoId) return confirmPublished(p, args.finishedVideoId);

  let videoId = await startAndUpload(p, args.video);
  if (args.cover) await setCover(p, videoId, args.cover);
  try {
    await finishReel(p, videoId, args);
  } catch (err) {
    if (!isUploadMissing(err)) throw err;
    console.error('Facebook reel upload missing at finish, uploading once more', { videoId });
    videoId = await startAndUpload(p, args.video);
    if (args.cover) await setCover(p, videoId, args.cover);
    await finishReel(p, videoId, args);
  }
  await args.onFinished?.(videoId);
  return confirmPublished(p, videoId);
}

async function startAndUpload(p: Page, video: string): Promise<string> {
  const { pageId, token } = p;
  const call = reelCall(p.fetchFn);

  const start = await call('start', `${FB_API}/${pageId}/video_reels`, {
    method: 'POST',
    body: new URLSearchParams({ upload_phase: 'start', access_token: token }),
  });
  const videoId = String(start.video_id ?? '');
  if (!videoId)
    throw new Error(`Facebook reel start returned no video_id: ${JSON.stringify(start)}`);

  // Facebook fetches the file itself from our public R2 URL.
  await call('upload', `${FB_RUPLOAD}/${videoId}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: video },
  });
  return videoId;
}

// The hook frame as the reel's cover. Not in Meta's Reels guide (the
// `/thumbnails` edge is the general Video one), so a refusal is logged and
// the reel posts with Facebook's own pick.
async function setCover(p: Page, videoId: string, cover: string): Promise<void> {
  try {
    const image = await p.fetchFn(cover);
    if (!image.ok) throw new Error(`cover download failed (${image.status})`);
    const form = new FormData();
    form.set('access_token', p.token);
    form.set('is_preferred', 'true');
    form.set('source', new Blob([await image.arrayBuffer()], { type: 'image/jpeg' }), 'cover.jpg');
    await reelCall(p.fetchFn)('cover', `${FB_API}/${videoId}/thumbnails`, {
      method: 'POST',
      body: form,
    });
  } catch (err) {
    console.error('Facebook reel cover not set, posting without it', {
      videoId,
      error: String(err),
    });
  }
}

async function finishReel(p: Page, videoId: string, args: PostArgs): Promise<void> {
  const { pageId, token } = p;
  const call = reelCall(p.fetchFn);

  const finish = new URLSearchParams({
    access_token: token,
    video_id: videoId,
    upload_phase: 'finish',
    video_state: 'PUBLISHED',
    description: args.caption,
  });
  if (args.title) finish.set('title', args.title);
  if (args.aiDisclosure) finish.set('is_ai_generated', 'true');
  const finishUrl = `${FB_API}/${pageId}/video_reels`;
  let done: Record<string, unknown>;
  try {
    done = await call('finish', finishUrl, { method: 'POST', body: finish });
  } catch (err) {
    // If this API version refuses the label field, post without it (the
    // owner labels by hand) rather than fail.
    if (!finish.has('is_ai_generated') || !/is_ai_generated/.test(String(err))) throw err;
    finish.delete('is_ai_generated');
    done = await call('finish', finishUrl, { method: 'POST', body: finish });
  }
  if (done.success === false) {
    throw new Error(`Facebook reel finish was refused: ${JSON.stringify(done)}`);
  }
}

// Processing and publishing run after finish. The reel only counts as
// posted once Facebook reports `publish_status: published`; a rejected
// video fails at once, and one still pending when the wait runs out fails
// too (a retry re-checks it, it doesn't post again). Rate limits and server
// errors on this read are waited out.
async function confirmPublished(p: Page, videoId: string): Promise<PublishResultT> {
  const call = reelCall(p.fetchFn);
  const url = `${FB_API}/${videoId}?fields=status,published&access_token=${encodeURIComponent(p.token)}`;
  let last: { status?: ReelStatus; published?: boolean } = {};
  for (let i = 0; i < p.pollAttempts; i++) {
    if (i > 0) await p.sleep(10_000);
    try {
      last = (await call('status', url, { method: 'GET' })) as typeof last;
    } catch (err) {
      if (err instanceof FacebookApiError && (err.status === 429 || err.status >= 500)) continue;
      throw err;
    }
    const error = reelError(last.status);
    if (error) throw new Error(`Facebook reel ${videoId} failed: ${error}`);
    if (last.status?.publishing_phase?.publish_status === 'published') {
      return {
        postId: videoId,
        url: `https://www.facebook.com/reel/${videoId}`,
        status: { published: last.published, ...last.status },
      };
    }
  }
  throw new Error(
    `Facebook reel ${videoId} was finished but isn't published yet: ${JSON.stringify(last)}`,
  );
}

type Phase = { status?: string; error?: { message?: string } };
type ReelStatus = {
  video_status?: string;
  uploading_phase?: Phase;
  processing_phase?: Phase;
  publishing_phase?: Phase & { publish_status?: string };
};

function reelError(s: ReelStatus | undefined): string | null {
  if (!s) return null;
  for (const phase of [s.uploading_phase, s.processing_phase, s.publishing_phase]) {
    if (phase?.error?.message) return phase.error.message;
    if (phase?.status === 'error') return 'error status';
  }
  if (
    s.video_status === 'error' ||
    s.video_status === 'upload_failed' ||
    s.video_status === 'expired'
  ) {
    return `video_status ${s.video_status}`;
  }
  return null;
}
