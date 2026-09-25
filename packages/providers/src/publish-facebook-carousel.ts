import type { CarouselPublishProvider, PublishResultT } from './contracts.ts';

const FB_API = 'https://graph.facebook.com/v22.0';

/**
 * P3.7 — Facebook Page multi-photo ("carousel") post, real Graph API v22.0
 * two-step flow (per Meta's own documented `{page-id}/photos` +
 * `{page-id}/feed` `attached_media` mechanism — there is no single
 * "carousel post" endpoint): upload each image unpublished
 * (`POST {page-id}/photos`, `url=<image>&published=false`) to collect a
 * `media_fbid` per image, then create one feed post referencing all of them
 * via `attached_media[i]={"media_fbid":"<id>"}`. Same per-project page
 * credential convention `publish-facebook.ts` already uses
 * (`FB_PAGE_ID_<pageRef>`/`FB_ACCESS_TOKEN_<pageRef>`).
 *
 * A partially-uploaded set (image 3 of 7 fails) is left as orphaned
 * unpublished photos on the Page rather than cleaned up — Graph API has no
 * "delete this unpublished photo" call cheap enough to chase on every
 * failure path, and an unpublished photo is otherwise invisible/harmless.
 * Flagged rather than silently accepted as a non-issue.
 */
export function createFacebookCarouselPublishProvider(opts?: {
  pageIdEnvPrefix?: string;
  tokenEnvPrefix?: string;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}): CarouselPublishProvider {
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
          `createFacebookCarouselPublishProvider: missing ${pageIdPrefix}${args.pageRef} / ${tokenPrefix}${args.pageRef}`,
        );
      }
      if (args.images.length < 2) {
        // A single-photo "carousel" is just a regular photo post — Meta's
        // own multi-photo mechanism requires at least 2 attached_media
        // entries to render as a carousel rather than a plain photo post.
        throw new Error(
          `createFacebookCarouselPublishProvider: a carousel post needs at least 2 images, got ${args.images.length}`,
        );
      }

      const mediaFbids: string[] = [];
      for (const imageUrl of args.images) {
        const params = new URLSearchParams({
          url: imageUrl,
          published: 'false',
          access_token: token,
        });
        const res = await fetchFn(`${FB_API}/${pageId}/photos`, { method: 'POST', body: params });
        if (!res.ok) {
          throw new Error(
            `Facebook carousel photo upload failed (${res.status}) for "${imageUrl}": ${await res.text()}`,
          );
        }
        const data = (await res.json()) as { id: string };
        mediaFbids.push(data.id);
      }

      const feedParams = new URLSearchParams({ message: args.caption, access_token: token });
      mediaFbids.forEach((id, i) => {
        feedParams.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }));
      });
      if (args.scheduleAt) {
        // Same scheduled-publish convention `publish-facebook.ts` uses:
        // unpublished post + a future unix `scheduled_publish_time`.
        const when = Math.floor(new Date(args.scheduleAt).getTime() / 1000);
        feedParams.set('published', 'false');
        feedParams.set('scheduled_publish_time', String(when));
      }

      const feedRes = await fetchFn(`${FB_API}/${pageId}/feed`, {
        method: 'POST',
        body: feedParams,
      });
      if (!feedRes.ok) {
        throw new Error(
          `Facebook carousel post failed (${feedRes.status}): ${await feedRes.text()}`,
        );
      }
      const feedData = (await feedRes.json()) as { id: string };
      return { postId: feedData.id, url: `https://www.facebook.com/${feedData.id}` };
    },
  };
}
