import { env } from '@content-platform/config';

const GRAPH_API = 'https://graph.facebook.com/v22.0';

/**
 * Post a photo or video to a Facebook page.
 * Merged from both facebook-news-pipeline/src/services/facebook.js and reels-pipeline equivalent.
 *
 * @param {string} pageKey   e.g. 'FR', 'IT', 'NATURE_PULSE', 'NATURE_FRAME'
 * @param {{ message: string, imageUrl?: string, videoPath?: string }} content
 * @returns {Promise<string>} post ID
 */
export async function postToFacebook(pageKey, { message, imageUrl, videoPath }) {
  const pageId = env[`FB_PAGE_ID_${pageKey}`];
  const token = env[`FB_ACCESS_TOKEN_${pageKey}`];
  if (!pageId || !token) throw new Error(`Missing Facebook credentials for page key: ${pageKey}`);

  if (videoPath) {
    return postVideo(pageId, token, videoPath, message);
  }
  return postPhoto(pageId, token, imageUrl, message);
}

async function postPhoto(pageId, token, imageUrl, message) {
  // TODO: migrate from facebook-news-pipeline/src/services/facebook.js
  const res = await fetch(`${GRAPH_API}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: imageUrl, caption: message, access_token: token }),
  });
  if (!res.ok) throw new Error(`Facebook photo post failed: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function postVideo(pageId, token, videoPath, message) {
  // TODO: migrate video upload (multipart) from reels-pipeline
  throw new Error('TODO: implement video upload to Facebook');
}
