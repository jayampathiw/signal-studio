import { env } from '@signal-studio/config';
import axios from 'axios';

const IG_BASE = 'https://graph.facebook.com/v22.0';

export const capabilities = {
  maxDurationSec: 90,
  aspectRatios: ['9:16'],
  supportsScheduling: false,
};

// Publish a hosted video as an Instagram Reel via the Graph API.
// Two-step: create container → publish container.
// Requires: IG_USER_ID_{envKey} and IG_ACCESS_TOKEN_{envKey} env vars.
export async function publish(contentItem, channelConfig) {
  const envKey = channelConfig.platforms.instagram.envKey;
  const userId = env[`IG_USER_ID_${envKey}`];
  const token = env[`IG_ACCESS_TOKEN_${envKey}`];

  if (!userId || !token) {
    throw new Error(
      `Missing IG credentials for envKey=${envKey} (IG_USER_ID_${envKey}, IG_ACCESS_TOKEN_${envKey})`,
    );
  }
  if (!contentItem.rendered_video_url) {
    throw new Error(`Content item ${contentItem.id} has no rendered_video_url.`);
  }

  const caption = buildCaption(contentItem);

  // Step 1: create media container
  const containerRes = await axios.post(`${IG_BASE}/${userId}/media`, null, {
    params: {
      media_type: 'REELS',
      video_url: contentItem.rendered_video_url,
      caption,
      share_to_feed: true,
      access_token: token,
    },
    timeout: 60_000,
  });
  const creationId = containerRes.data.id;

  // Wait for container to finish processing (poll up to 60s)
  await waitForContainer(userId, creationId, token);

  // Step 2: publish
  const publishRes = await axios.post(`${IG_BASE}/${userId}/media_publish`, null, {
    params: { creation_id: creationId, access_token: token },
    timeout: 30_000,
  });

  const postId = publishRes.data.id;
  return {
    postId,
    postedAt: new Date(),
    platformUrl: `https://www.instagram.com/reel/${postId}/`,
  };
}

async function waitForContainer(userId, creationId, token, maxWaitMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await axios.get(`${IG_BASE}/${creationId}`, {
      params: { fields: 'status_code,status', access_token: token },
    });
    const { status_code } = res.data;
    if (status_code === 'FINISHED') return;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      throw new Error(`IG media container ${creationId} failed with status: ${status_code}`);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`IG media container ${creationId} did not finish within ${maxWaitMs / 1000}s`);
}

function buildCaption(contentItem) {
  if (contentItem.seo?.description) {
    const { description, hashtags = [] } = contentItem.seo;
    const hashtagLine = hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ');
    return [description, hashtagLine].filter(Boolean).join('\n\n');
  }
  const { intro, question, cta } = contentItem.ai_caption || {};
  return [intro, question, cta].filter(Boolean).join('\n\n');
}
