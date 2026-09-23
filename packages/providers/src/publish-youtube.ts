import { createWriteStream, createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import type { PublishProvider, PublishResultT } from './contracts.ts';

/**
 * P3.5 — YouTube Shorts publish, rewritten clean against the
 * `PublishProvider` contract (ported in spirit, not verbatim, from
 * `apps/video/src/publishers/youtube.js` — that file also had the same
 * ambiguous `seo`/`ai_caption` DB-row caption source `publish-facebook.ts`'s
 * own header flags; this provider takes `caption`/`title` as plain
 * arguments instead).
 *
 * **AI-disclosure — real, verified, not the old file's gap**: the old
 * `youtube.js` never set anything for this at all, despite the plan's own
 * T-P checklist calling for a "'altered content' toggle." Confirmed via
 * YouTube Data API v3's own discovery document that `status.
 * containsSyntheticMedia` is a real, currently-documented boolean field for
 * exactly this — set here from `args.aiDisclosure`.
 *
 * `scheduleAt` uses YouTube's real scheduled-publish mechanism:
 * `privacyStatus: 'private'` + `status.publishAt` (RFC 3339) — YouTube
 * flips it to public on its own at that time, no second call needed.
 *
 * Dependency-injectable `youtubeClient` (a `googleapis` `youtube('v3')`-
 * shaped object) rather than constructing the OAuth2 client internally, so
 * this is testable without real Google credentials — same DI convention as
 * this package's other providers taking `fetchFn`.
 */
export type YoutubeVideosInsertClient = {
  videos: {
    insert(args: {
      part: string[];
      requestBody: {
        snippet: { title: string; description: string; tags?: string[]; categoryId?: string };
        status: {
          privacyStatus: 'public' | 'private';
          publishAt?: string;
          selfDeclaredMadeForKids: boolean;
          containsSyntheticMedia?: boolean;
        };
      };
      media: { mimeType: string; body: NodeJS.ReadableStream };
    }): Promise<{ data: { id: string } }>;
  };
};

export function createYoutubePublishProvider(opts: {
  youtubeClient: YoutubeVideosInsertClient;
  categoryId?: string;
  fetchFn?: typeof fetch;
}): PublishProvider {
  const fetchFn = opts.fetchFn ?? fetch;

  return {
    async post(args): Promise<PublishResultT> {
      const tmpPath = path.join(os.tmpdir(), `yt-upload-${Date.now()}.mp4`);
      const res = await fetchFn(args.video);
      if (!res.ok || !res.body) {
        throw new Error(
          `createYoutubePublishProvider: download failed (${res.status}): ${args.video}`,
        );
      }
      await pipeline(res.body, createWriteStream(tmpPath));

      try {
        const uploadRes = await opts.youtubeClient.videos.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: args.title ?? 'Untitled',
              description: args.caption,
              categoryId: opts.categoryId ?? '15', // 15 = Pets & Animals, this repo's own default
            },
            status: {
              privacyStatus: args.scheduleAt ? 'private' : 'public',
              publishAt: args.scheduleAt,
              selfDeclaredMadeForKids: false,
              containsSyntheticMedia: args.aiDisclosure,
            },
          },
          media: { mimeType: 'video/mp4', body: createReadStream(tmpPath) },
        });

        const videoId = uploadRes.data.id;
        return { postId: videoId, url: `https://www.youtube.com/shorts/${videoId}` };
      } finally {
        await rm(tmpPath, { force: true });
      }
    },
  };
}
