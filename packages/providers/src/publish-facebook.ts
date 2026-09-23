import type { PublishProvider, PublishResultT } from './contracts.ts';

const FB_API = 'https://graph.facebook.com/v22.0';

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
 * **AI-disclosure**: `args.aiDisclosure` is accepted (required by the
 * shared `PublishProvider` contract) but has no effect here — confirmed
 * there is no documented Graph API field for declaring AI-generated
 * content on a Page video post; this is a manual Meta Business Suite step
 * today (the plan's own T-P checklist already says exactly that: "Pilot
 * post scheduled in Meta Business Suite with AI label"), not something an
 * API call can set. Flagged rather than silently mapped to the wrong
 * parameter.
 */
export function createFacebookPublishProvider(opts?: {
  pageIdEnvPrefix?: string;
  tokenEnvPrefix?: string;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}): PublishProvider {
  const env = opts?.env ?? process.env;
  const pageIdPrefix = opts?.pageIdEnvPrefix ?? 'FB_PAGE_ID_';
  const tokenPrefix = opts?.tokenEnvPrefix ?? 'FB_ACCESS_TOKEN_';
  const fetchFn = opts?.fetchFn ?? fetch;

  return {
    async post(args): Promise<PublishResultT> {
      const pageId = env[`${pageIdPrefix}${args.pageRef}`];
      const token = env[`${tokenPrefix}${args.pageRef}`];
      if (!pageId || !token) {
        throw new Error(
          `createFacebookPublishProvider: missing ${pageIdPrefix}${args.pageRef} / ${tokenPrefix}${args.pageRef}`,
        );
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
