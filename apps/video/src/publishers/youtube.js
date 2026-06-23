import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { pipeline } from 'stream/promises';
import { rmSync } from 'fs';
import { google } from 'googleapis';
import { env } from '@signal-studio/config';

export const capabilities = {
  maxDurationSec: 60,
  aspectRatios: ['9:16'],
  supportsScheduling: false,
};

// Upload a rendered reel to YouTube as a Short (vertical ≤ 60s).
// Uses OAuth2 refresh token flow — YT_CLIENT_ID_{envKey}, YT_CLIENT_SECRET_{envKey},
// YT_REFRESH_TOKEN_{envKey} must be set.
export async function publish(contentItem, channelConfig) {
  const envKey = channelConfig.platforms.youtube.envKey;
  const clientId     = env[`YT_CLIENT_ID_${envKey}`];
  const clientSecret = env[`YT_CLIENT_SECRET_${envKey}`];
  const refreshToken = env[`YT_REFRESH_TOKEN_${envKey}`];

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Missing YT credentials for envKey=${envKey}`);
  }
  if (!contentItem.rendered_video_url) {
    throw new Error(`Content item ${contentItem.id} has no rendered_video_url.`);
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const youtube = google.youtube({ version: 'v3', auth });

  const title       = contentItem.seo?.title || contentItem.title || 'Wild Capture';
  const description = buildDescription(contentItem);
  const tags        = contentItem.seo?.hashtags ?? contentItem.hashtags ?? [];

  // Download video to temp file (YouTube client requires a readable stream)
  const tmpPath = join(tmpdir(), `yt-upload-${contentItem.id}-${Date.now()}.mp4`);
  try {
    const res = await fetch(contentItem.rendered_video_url);
    if (!res.ok) throw new Error(`Download failed ${res.status}: ${contentItem.rendered_video_url}`);
    await pipeline(res.body, createWriteStream(tmpPath));

    const { createReadStream } = await import('fs');
    const uploadRes = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: { title, description, tags, categoryId: '15' }, // 15 = Pets & Animals
        status:  { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      },
      media: { mimeType: 'video/mp4', body: createReadStream(tmpPath) },
    });

    const videoId = uploadRes.data.id;
    return {
      postId:      videoId,
      postedAt:    new Date(),
      platformUrl: `https://www.youtube.com/shorts/${videoId}`,
    };
  } finally {
    rmSync(tmpPath, { force: true });
  }
}

function buildDescription(contentItem) {
  if (contentItem.seo?.description) {
    const { description, hashtags = [] } = contentItem.seo;
    const hashtagLine = hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ');
    return [description, hashtagLine].filter(Boolean).join('\n\n');
  }
  const { intro, question, cta } = contentItem.ai_caption || {};
  return [intro, question, cta].filter(Boolean).join('\n\n');
}
