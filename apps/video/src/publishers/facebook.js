import axios from 'axios';
import { env } from '@signal-studio/config';

const FB_BASE = 'https://graph.facebook.com/v22.0';

export const capabilities = {
  maxDurationSec: 90,
  aspectRatios: ['9:16'],
  maxFileSizeMB: 4000,
  supportsScheduling: true,
};

// Posts a hosted video to a Facebook Page using the file_url path.
// Works for vertical reels that surface in the page's video tab + feed.
export async function publish(contentItem, channelConfig) {
  const envKey = channelConfig.platforms.facebook.envKey;
  const pageId = env[`FB_PAGE_ID_${envKey}`];
  const token  = env[`FB_ACCESS_TOKEN_${envKey}`];

  if (!pageId || !token) {
    throw new Error(`Missing FB credentials for envKey=${envKey} (FB_PAGE_ID_${envKey}, FB_ACCESS_TOKEN_${envKey})`);
  }
  if (!contentItem.rendered_video_url) {
    throw new Error(`Content item ${contentItem.id} has no rendered_video_url. Run generate-reel first.`);
  }

  // Wild Eye rows carry captions in the `seo` jsonb {title, description, hashtags[]}.
  // Legacy news/pexels rows use `ai_caption` {intro, question, cta} + `hashtags` text[].
  let caption, title;
  if (contentItem.seo?.description) {
    const { description, hashtags = [] } = contentItem.seo;
    const hashtagLine = hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ');
    caption = [description, hashtagLine].filter(Boolean).join('\n\n');
    title = contentItem.seo.title || contentItem.title || '';
  } else {
    const { intro, question, cta } = contentItem.ai_caption || {};
    const captionParts = [intro, question, cta].filter(Boolean);
    const hashtagLine = (contentItem.hashtags || []).map(h => `#${h.replace(/^#/, '')}`).join(' ');
    if (hashtagLine) captionParts.push(hashtagLine);
    caption = captionParts.join('\n\n');
    title = contentItem.title || '';
  }

  if (!caption) {
    throw new Error(`Content item ${contentItem.id} has no caption. Populate seo.description (Wild Eye) or ai_caption (news/pexels) before publishing.`);
  }

  const res = await axios.post(`${FB_BASE}/${pageId}/videos`, null, {
    params: {
      file_url: contentItem.rendered_video_url,
      description: caption,
      title,
      access_token: token,
    },
    timeout: 120_000,
  });

  const postId = res.data.id;
  return {
    postId,
    postedAt: new Date(),
    platformUrl: `https://www.facebook.com/${postId}`,
  };
}
