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

  return {
    async post(args): Promise<PublishResultT> {
      const pageId = env[`${pageIdPrefix}${args.pageRef}`];
      const token = env[`${tokenPrefix}${args.pageRef}`];
      if (!pageId || !token) {
        throw new Error(
          `createFacebookPublishProvider: missing ${pageIdPrefix}${args.pageRef} / ${tokenPrefix}${args.pageRef}`,
        );
      }

      if (args.reel) {
        return postReel({ pageId, token, args, fetchFn, sleep, pollAttempts });
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

async function postReel(p: {
  pageId: string;
  token: string;
  args: PostArgs;
  fetchFn: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  pollAttempts: number;
}): Promise<PublishResultT> {
  const { pageId, token, args, fetchFn } = p;
  const call = async (step: string, url: string, init: RequestInit) => {
    const res = await fetchFn(url, init);
    if (!res.ok) {
      throw new Error(`Facebook reel ${step} failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as Record<string, unknown>;
  };

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
    headers: { Authorization: `OAuth ${token}`, file_url: args.video },
  });

  const finish = new URLSearchParams({
    access_token: token,
    video_id: videoId,
    upload_phase: 'finish',
    video_state: args.scheduleAt ? 'SCHEDULED' : 'PUBLISHED',
    description: args.caption,
  });
  if (args.title) finish.set('title', args.title);
  if (args.scheduleAt) {
    finish.set(
      'scheduled_publish_time',
      String(Math.floor(new Date(args.scheduleAt).getTime() / 1000)),
    );
  }
  if (args.aiDisclosure) finish.set('is_ai_generated', 'true');
  const finishUrl = `${FB_API}/${pageId}/video_reels`;
  let done: Record<string, unknown>;
  try {
    done = await call('finish', finishUrl, { method: 'POST', body: finish });
  } catch (err) {
    // Not yet proven on a live post: if this API version refuses the label
    // field, post without it (the owner labels by hand) rather than fail.
    if (!finish.has('is_ai_generated') || !/is_ai_generated/.test(String(err))) throw err;
    finish.delete('is_ai_generated');
    done = await call('finish', finishUrl, { method: 'POST', body: finish });
  }
  if (done.success === false) {
    throw new Error(`Facebook reel finish was refused: ${JSON.stringify(done)}`);
  }

  // Processing runs after finish; surface a rejected video (bad format,
  // too long) as a failure instead of reporting a post that never appears.
  // Still processing when the wait runs out is fine: Facebook carries on.
  for (let i = 0; i < p.pollAttempts; i++) {
    const status = (
      await call(
        'status',
        `${FB_API}/${videoId}?fields=status&access_token=${encodeURIComponent(token)}`,
        { method: 'GET' },
      )
    ).status as ReelStatus | undefined;
    const error = reelError(status);
    if (error) throw new Error(`Facebook reel ${videoId} failed: ${error}`);
    const publish = status?.publishing_phase?.publish_status;
    if (
      DONE.has(status?.processing_phase?.status ?? '') ||
      publish === 'published' ||
      publish === 'scheduled'
    ) {
      break;
    }
    await p.sleep(10_000);
  }

  return { postId: videoId, url: `https://www.facebook.com/reel/${videoId}` };
}

// The docs spell it both ways (`complete` in examples, `completed` in the table).
const DONE = new Set(['complete', 'completed']);

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
