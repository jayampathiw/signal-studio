import { env } from '@signal-studio/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import FormData from 'form-data';
import axios from 'axios';
import { getSlotsForDate, logBoostEligibleWindowStart } from '../config/slots.js';
import { postVideoToFacebook } from '@signal-studio/publishers/facebook';
import { getPendingArticlesSortedByScore, getFirstBoostIneligiblePostedIT, updateArticle } from '@signal-studio/database/articles';
import { nearestSlot } from '../enrich/publishScore.js';
import { compositeImage } from '../enrich/imageComposite.js';

const FB_BASE = 'https://graph.facebook.com/v22.0';
const IMAGE_PROVIDER = env.IMAGE_PROVIDER || 'pollinations';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_KEY'];
const missing = REQUIRED_ENV.filter(k => !env[k]);
if (missing.length) {
  console.error(`PUBLISH-SLOT FAILED: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (IMAGE_PROVIDER === 'cloudflare' && (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN)) {
  console.error('Missing CF_ACCOUNT_ID or CF_API_TOKEN for Cloudflare image generation');
  process.exit(1);
}
if (IMAGE_PROVIDER === 'google' && !env.GOOGLE_AI_KEY) {
  console.error('Missing GOOGLE_AI_KEY for Google AI image generation');
  process.exit(1);
}

async function run() {
  console.log(`[publish-slot] Starting: ${new Date().toISOString()}`);

  for (const country of ['IT', 'FR']) {
    const slots = getSlotsForDate(country);
    if (slots.length === 0) {
      console.log(`[${country}] No slots configured for today`);
      continue;
    }
    const { inWindow, closest } = nearestSlot(country, slots);
    if (!inWindow) {
      console.log(`[${country}] Not in slot window (nearest: ${closest} from [${slots.join(', ')}])`);
      continue;
    }
    console.log(`[${country}] In slot window for ${closest} CEST (today's slots: ${slots.join(', ')})`);
    await publishForCountry(country, closest);
  }

  console.log(`[publish-slot] Done: ${new Date().toISOString()}`);
}

async function publishForCountry(country, slotTarget) {
  const articles = await getPendingArticlesSortedByScore(country);
  if (!articles.length) {
    console.log(`[${country}] No pending articles with captions`);
    return;
  }

  const article = articles[0];
  const runnerUp = articles[1];
  console.log(`[${country}] slot=${slotTarget} article=${article.id} score=${article.publish_score?.toFixed(1)} runner_up_score=${runnerUp?.publish_score?.toFixed(1) ?? 'none'}`);

  if (!article.ai_caption?.intro && !article.ai_caption?.text) {
    console.error(`[${country}] Article ${article.id} has no ai_caption — skipping`);
    return;
  }
  if (!article.image_prompt) {
    console.error(`[${country}] Article ${article.id} has no image_prompt — skipping`);
    return;
  }

  const pageId = env[`FB_PAGE_ID_${country}`];
  const token  = env[`FB_ACCESS_TOKEN_${country}`];
  if (!pageId || !token) {
    console.error(`[${country}] Missing FB credentials — skipping`);
    return;
  }

  try {
    let fbPostId;
    const captionText = [article.ai_caption.intro, article.ai_caption.question, article.ai_caption.cta]
      .filter(Boolean).join('\n\n') || article.ai_caption.text || '';

    if (article.post_format === 'video' && article.reel_path) {
      console.log(`[${country}] Uploading reel video for article ${article.id}…`);
      fbPostId = await postVideoToFacebook(article.reel_path, article.ai_caption, article, country);
    } else {
      console.log(`[${country}] Generating image for article ${article.id}…`);
      const rawBuffer   = await generateImage(article.image_prompt);
      const imageBuffer = await sharpenBuffer(rawBuffer);

      console.log(`[${country}] Compositing overlay…`);
      const finalBuffer = await compositeImage(imageBuffer, article.image_headline ?? '', country);

      console.log(`[${country}] Uploading to Facebook…`);
      fbPostId = await uploadToFacebook(finalBuffer, captionText, pageId, token);
    }

    const postedAt = new Date().toISOString();
    await updateArticle(article.id, {
      status: 'posted',
      fb_post_id: fbPostId,
      posted_at: postedAt,
    });

    console.log(`[${country}] SLOT_POST slot_target=${slotTarget} actual_fire_time=${postedAt} article_id=${article.id} publish_score=${article.publish_score?.toFixed(1)} runner_up=${runnerUp?.id ?? 'none'} runner_up_score=${runnerUp?.publish_score?.toFixed(1) ?? 'none'}`);
    console.log(`[${country}] Posted: https://www.facebook.com/${fbPostId}`);

    if (country === 'IT' && article.boost_eligible === false) {
      const existing = await getFirstBoostIneligiblePostedIT();
      if (!existing || existing.id === article.id) {
        logBoostEligibleWindowStart(country, article.id, postedAt);
      }
    }
  } catch (err) {
    console.error(`[${country}] Failed to post article ${article.id}: ${err.message}`);
    await updateArticle(article.id, { status: 'failed' });
  }
}

const NEGATIVE_PROMPT = 'cartoon, anime, illustration, painting, drawing, 3D render, CGI, digital art, watercolor, concept art, unrealistic, fantasy, sketch, vector art, low quality, blurry, soft focus, out of focus, noise, grain, jpeg artifacts, disembodied limbs, floating hands, floating arms, extra limbs, severed limbs, missing body, anatomical errors, extra fingers, deformed hands, mutated body parts';
const PHOTO_PREFIX = 'DSLR photograph, photorealistic, tack sharp, ultra detailed, high resolution, 8K UHD, f/8 maximum clarity, high micro-contrast, crisp edges — ';

function buildPrompt(raw) {
  return `${PHOTO_PREFIX}${raw}`;
}

async function sharpenBuffer(buffer) {
  return sharp(buffer).sharpen({ sigma: 1.2, m1: 0.5, m2: 3.5 }).toBuffer();
}

async function generateImage(prompt) {
  console.log(`[image] Generating via provider: ${IMAGE_PROVIDER}`);
  if (IMAGE_PROVIDER === 'google')       return generateImageGoogle(prompt);
  if (IMAGE_PROVIDER === 'pollinations') return generateImagePollinations(prompt);
  return generateImageCloudflare(prompt);
}

async function generateImageCloudflare(prompt) {
  const model = env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`;
  const res = await axios.post(url,
    { prompt: buildPrompt(prompt), num_steps: 8, width: 1080, height: 1080 },
    { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 60000 }
  );
  return Buffer.from(res.data.result.image, 'base64');
}

async function generateImageGoogle(prompt) {
  const model = env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_AI_KEY}`;
  const res = await axios.post(url, {
    contents: [{ parts: [{ text: `${buildPrompt(prompt)}\n\nNegative prompt: ${NEGATIVE_PROMPT}` }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
  const parts = res.data.candidates[0].content.parts;
  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart) throw new Error('Google AI returned no image in response');
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

async function generateImagePollinations(prompt) {
  const model = env.POLLINATIONS_MODEL || 'flux-pro';
  const token = env.POLLINATIONS_TOKEN ? `&token=${env.POLLINATIONS_TOKEN}` : '';
  const negative = `&negative=${encodeURIComponent(NEGATIVE_PROMPT)}`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(buildPrompt(prompt))}?width=1080&height=1080&model=${model}&nologo=true&enhance=true&steps=35${negative}${token}`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 150000 });
  return Buffer.from(res.data);
}

async function uploadToFacebook(imageBuffer, caption, pageId, token) {
  const form = new FormData();
  form.append('caption', caption);
  form.append('access_token', token);
  form.append('source', imageBuffer, { filename: 'post.png', contentType: 'image/png' });

  const res = await axios.post(`${FB_BASE}/${pageId}/photos`, form, {
    headers: form.getHeaders(),
    timeout: 60000,
  });

  return res.data.id;
}

run().catch(err => {
  console.error('PUBLISH-SLOT FAILED:', err);
  process.exit(1);
});
