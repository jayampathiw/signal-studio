import { env } from '@signal-studio/config';
import axios from 'axios';

const TT_BASE = 'https://open.tiktokapis.com/v2';

export const capabilities = {
  maxDurationSec: 60,
  aspectRatios: ['9:16'],
  supportsScheduling: false,
};

// Publish a rendered reel to TikTok via the Content Posting API (URL-based upload).
// Requires: TT_CLIENT_KEY_{envKey}, TT_CLIENT_SECRET_{envKey}, TT_ACCESS_TOKEN_{envKey}.
export async function publish(contentItem, channelConfig) {
  const envKey = channelConfig.platforms.tiktok.envKey;
  const accessToken = env[`TT_ACCESS_TOKEN_${envKey}`];

  if (!accessToken) {
    throw new Error(`Missing TT_ACCESS_TOKEN_${envKey}`);
  }
  if (!contentItem.rendered_video_url) {
    throw new Error(`Content item ${contentItem.id} has no rendered_video_url.`);
  }

  const title = contentItem.seo?.title || contentItem.title || '';

  // Step 1: initialise upload (URL-based — no binary transfer needed)
  const initRes = await axios.post(
    `${TT_BASE}/post/publish/video/init/`,
    {
      post_info: {
        title: title.slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: contentItem.rendered_video_url,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      timeout: 30_000,
    },
  );

  const publishId = initRes.data?.data?.publish_id;
  if (!publishId) {
    throw new Error(`TikTok init returned no publish_id: ${JSON.stringify(initRes.data)}`);
  }

  // Step 2: poll for completion (up to 90s — TikTok processing can be slow)
  await waitForPublish(publishId, accessToken);

  return {
    postId: publishId,
    postedAt: new Date(),
    platformUrl: null, // TikTok API doesn't return a direct post URL at publish time
  };
}

async function waitForPublish(publishId, accessToken, maxWaitMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await axios.post(
      `${TT_BASE}/post/publish/status/fetch/`,
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
      },
    );
    const status = res.data?.data?.status;
    if (status === 'PUBLISH_COMPLETE') return;
    if (status === 'FAILED') {
      const reason = res.data?.data?.fail_reason || 'unknown';
      throw new Error(`TikTok publish failed: ${reason}`);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`TikTok publish ${publishId} did not complete within ${maxWaitMs / 1000}s`);
}
