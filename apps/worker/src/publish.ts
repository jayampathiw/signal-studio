import type { CarouselPublishProvider, PublishProvider } from '@signal-studio/providers/contracts';
import { createFacebookPublishProvider } from '@signal-studio/providers/publish-facebook';
import { createFacebookCarouselPublishProvider } from '@signal-studio/providers/publish-facebook-carousel';
import {
  createYoutubePublishProvider,
  type YoutubeVideosInsertClient,
} from '@signal-studio/providers/publish-youtube';
import { google } from 'googleapis';

/**
 * Picks a real `PublishProvider` by platform name (`manifest.publish[]`
 * entries / `project.publishTargets[].platform`) — same factory-by-id
 * pattern `storage.ts`'s `createStorageProviderFor` already established.
 *
 * `credentialRef` is `project.v1`'s `PublishTarget.credentialRef` for this
 * platform. Facebook resolves its own credentials per-call (via
 * `args.pageRef`, already handled inside `publish-facebook.ts`), so it
 * doesn't need `credentialRef` here at all — but YouTube's `googleapis`
 * client bakes OAuth2 credentials in at construction time (a single
 * pre-built client per channel, not per-post — see `publish-youtube.ts`'s
 * own header), so it needs resolving here instead. Same
 * `YT_CLIENT_ID_<ref>`/`YT_CLIENT_SECRET_<ref>`/`YT_REFRESH_TOKEN_<ref>` env
 * convention the old `apps/video/src/publishers/youtube.js` used.
 */
export function createPublishProviderFor(platform: string, credentialRef: string): PublishProvider {
  if (platform === 'facebook') return createFacebookPublishProvider();
  if (platform === 'youtube') {
    const clientId = process.env[`YT_CLIENT_ID_${credentialRef}`];
    const clientSecret = process.env[`YT_CLIENT_SECRET_${credentialRef}`];
    const refreshToken = process.env[`YT_REFRESH_TOKEN_${credentialRef}`];
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        `createPublishProviderFor: missing YT_CLIENT_ID_${credentialRef}/YT_CLIENT_SECRET_${credentialRef}/YT_REFRESH_TOKEN_${credentialRef}`,
      );
    }
    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });
    const youtube = google.youtube({ version: 'v3', auth });
    // `YoutubeVideosInsertClient` is a minimal shape (this provider's own
    // choice, so it's testable without the real googleapis types) — the
    // real client's `videos.insert()` has a much wider overload set
    // (streaming/callback variants) than that shape declares, so a direct
    // structural assignment fails `tsc`. This adapter narrows to the exact
    // single-arg-returns-a-promise call this provider actually makes.
    const youtubeClient: YoutubeVideosInsertClient = {
      videos: {
        insert: (args) =>
          youtube.videos.insert(args) as unknown as ReturnType<
            YoutubeVideosInsertClient['videos']['insert']
          >,
      },
    };
    return createYoutubePublishProvider({ youtubeClient });
  }
  throw new Error(`Unsupported publish platform "${platform}" (expected "facebook" or "youtube")`);
}

/**
 * P3.7 — same factory-by-id pattern as `createPublishProviderFor` above,
 * for `CarouselPublishProvider` instead. Facebook only, for now — Meta's
 * own multi-photo `attached_media` mechanism this provider implements is a
 * Page-feed-post concept, not something YouTube (no photo-carousel concept
 * at all) or Instagram (a real, separate Graph API carousel-container flow,
 * not this one) can reuse; those need their own providers when a real job
 * needs them, not a guessed reuse of this one.
 */
export function createCarouselPublishProviderFor(platform: string): CarouselPublishProvider {
  if (platform === 'facebook') return createFacebookCarouselPublishProvider();
  throw new Error(`Unsupported carousel publish platform "${platform}" (expected "facebook")`);
}
