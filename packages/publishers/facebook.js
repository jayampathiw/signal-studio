import { readFile } from 'fs/promises';
import axios from 'axios';
import FormData from 'form-data';
import { env } from '@signal-studio/config';

const FB_BASE = 'https://graph.facebook.com/v22.0';

// Countries where boost_eligible=false articles must not be promoted (D3a decision, IT-first)
export const BOOST_ELIGIBLE_ENFORCED = { IT: true, FR: false };

// Post a text+link article to a country's Facebook page.
// Used by the news pipeline for standard article posts.
export async function postToFacebook(article, captionObj, country) {
  const pageId = env[`FB_PAGE_ID_${country}`];
  const token  = env[`FB_ACCESS_TOKEN_${country}`];

  if (!pageId || !token) {
    throw new Error(`Missing Facebook credentials for country: ${country}`);
  }

  const { intro, question, cta } = captionObj;
  const message = [intro, question, cta].filter(Boolean).join('\n\n');

  const response = await axios.post(`${FB_BASE}/${pageId}/feed`, {
    message,
    link: article.original_url,
    access_token: token,
  });

  return response.data.id;
}

// Upload a video file to a Facebook page.
export async function postVideoToFacebook(videoPath, captionObj, article, country) {
  const pageId = env[`FB_PAGE_ID_${country}`];
  const token  = env[`FB_ACCESS_TOKEN_${country}`];
  if (!pageId || !token) throw new Error(`Missing Facebook credentials for country: ${country}`);

  const { intro, question, cta } = captionObj;
  const caption = [intro, question, cta].filter(Boolean).join('\n\n');

  const videoBuffer = await readFile(videoPath);
  const form = new FormData();
  form.append('video_source', videoBuffer, { filename: 'reel.mp4', contentType: 'video/mp4' });
  form.append('caption', caption);
  form.append('description', article.title || '');
  form.append('access_token', token);

  const res = await axios.post(`${FB_BASE}/${pageId}/videos`, form, {
    headers: form.getHeaders(),
    timeout: 120_000,
  });

  return res.data.id;
}

// Posts multiple images as a single Facebook multi-photo post.
// imageUrls: array of public URLs already stored in Supabase Storage.
// Each image is first registered as an unpublished photo, then all are
// attached to a single feed post in one call.
export async function postMultiPhotoToFacebook(imageUrls, captionObj, country) {
  const pageId = env[`FB_PAGE_ID_${country}`];
  const token  = env[`FB_ACCESS_TOKEN_${country}`];
  if (!pageId || !token) throw new Error(`Missing Facebook credentials for country: ${country}`);

  const { intro, question, cta } = captionObj;
  const message = [intro, question, cta].filter(Boolean).join('\n\n');

  const photoIds = [];
  for (const url of imageUrls) {
    const res = await axios.post(`${FB_BASE}/${pageId}/photos`, null, {
      params: { url, published: false, access_token: token },
    });
    photoIds.push(res.data.id);
  }

  const feedRes = await axios.post(`${FB_BASE}/${pageId}/feed`, {
    message,
    attached_media: photoIds.map(id => ({ media_fbid: id })),
    access_token: token,
  });

  return feedRes.data.id;
}

export async function deletePost(postId, country) {
  const token = env[`FB_ACCESS_TOKEN_${country}`];
  if (!token) throw new Error(`Missing Facebook token for country: ${country}`);

  await axios.delete(`${FB_BASE}/${postId}`, {
    params: { access_token: token },
  });
}

// Generic dispatcher used by non-news pipelines (reels, etc.)
// For news-specific posting use postToFacebook / postVideoToFacebook / postMultiPhotoToFacebook above.
export async function postContent(pageKey, { message, imageUrl, videoPath }) {
  const pageId = env[`FB_PAGE_ID_${pageKey}`];
  const token  = env[`FB_ACCESS_TOKEN_${pageKey}`];
  if (!pageId || !token) throw new Error(`Missing Facebook credentials for page key: ${pageKey}`);

  if (videoPath) {
    const videoBuffer = await readFile(videoPath);
    const form = new FormData();
    form.append('video_source', videoBuffer, { filename: 'reel.mp4', contentType: 'video/mp4' });
    form.append('caption', message || '');
    form.append('access_token', token);
    const res = await axios.post(`${FB_BASE}/${pageId}/videos`, form, {
      headers: form.getHeaders(),
      timeout: 120_000,
    });
    return res.data.id;
  }

  if (imageUrl) {
    const res = await axios.post(`${FB_BASE}/${pageId}/photos`, null, {
      params: { url: imageUrl, caption: message || '', access_token: token },
    });
    return res.data.id;
  }

  const res = await axios.post(`${FB_BASE}/${pageId}/feed`, {
    message: message || '',
    access_token: token,
  });
  return res.data.id;
}
