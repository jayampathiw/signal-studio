import { env } from '@signal-studio/config';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import axios from 'axios';
import { getClient } from '@signal-studio/database';
import { compositeImage } from '../enrich/imageComposite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 4 levels up from apps/news/src/scripts/ reaches the monorepo root
const OUTPUT_DIR = resolve(__dirname, '../../../../output/previews');
const IMAGE_PROVIDER = env.IMAGE_PROVIDER || 'pollinations';

mkdirSync(OUTPUT_DIR, { recursive: true });

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('Usage: node apps/news/src/scripts/preview-images.js <id1> <id2> ...');
  process.exit(1);
}

async function run() {
  console.log(`[preview] Provider: ${IMAGE_PROVIDER}`);
  console.log(`[preview] Output: ${OUTPUT_DIR}\n`);

  const supabase = getClient();
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, country, image_prompt, image_headline')
    .in('id', ids);

  if (error) { console.error('DB error:', error.message); process.exit(1); }

  for (const article of articles) {
    if (!article.image_prompt) {
      console.warn(`[${article.id}] No image_prompt — skipping`);
      continue;
    }

    console.log(`[${article.id}] Generating: "${article.title?.slice(0, 60)}"`);

    try {
      const rawBuffer   = await generateImage(article.image_prompt);
      const imageBuffer = await sharpenBuffer(rawBuffer);
      const finalBuffer = await compositeImage(imageBuffer, article.image_headline ?? '', article.country);

      const outPath = resolve(OUTPUT_DIR, `${article.id}.png`);
      await sharp(finalBuffer).toFile(outPath);
      console.log(`  ✓ Saved: ${outPath}`);
      console.log(`  Headline: "${article.image_headline}"`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }

    console.log('');
  }

  console.log('[preview] Done — open the output/previews/ folder to review images.');
}

const PHOTO_NEGATIVE = 'cartoon, anime, illustration, painting, drawing, 3D render, CGI, digital art, watercolor, concept art, unrealistic, fantasy, sketch, vector art, low quality, blurry, soft focus, out of focus, noise, grain, jpeg artifacts, disembodied limbs, floating hands, floating arms, extra limbs, severed limbs, missing body, anatomical errors, extra fingers, deformed hands, mutated body parts';
const EDITORIAL_NEGATIVE = 'photorealistic photograph, DSLR photo, stock photography, hyperrealistic skin texture, low quality, blurry, noise, jpeg artifacts, deformed limbs, extra fingers, anatomical errors, missing limbs';
const IMAGE_STYLE = env.IMAGE_STYLE || 'editorial';
const PHOTO_PREFIX = 'DSLR photograph, photorealistic, tack sharp, ultra detailed, high resolution, 8K UHD, f/8 maximum clarity, high micro-contrast, crisp edges — ';

function buildPrompt(raw) {
  if (IMAGE_STYLE === 'photoreal') return `${PHOTO_PREFIX}${raw}`;
  return raw;
}

function getNegativePrompt() {
  return IMAGE_STYLE === 'photoreal' ? PHOTO_NEGATIVE : EDITORIAL_NEGATIVE;
}

async function sharpenBuffer(buffer) {
  return sharp(buffer).sharpen({ sigma: 1.2, m1: 0.5, m2: 3.5 }).toBuffer();
}

async function generateImage(prompt) {
  if (IMAGE_PROVIDER === 'google')       return generateImageGoogle(prompt);
  if (IMAGE_PROVIDER === 'pollinations') return generateImagePollinations(prompt);
  return generateImageCloudflare(prompt);
}

async function generateImageCloudflare(prompt) {
  const model = env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/${model}`;
  const res = await axios.post(url,
    { prompt: buildPrompt(prompt), num_steps: 8, width: 1080, height: 1920 },
    { headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 60000 }
  );
  return Buffer.from(res.data.result.image, 'base64');
}

async function generateImageGoogle(prompt) {
  const model = env.GOOGLE_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GOOGLE_AI_KEY}`;
  const res = await axios.post(url, {
    contents: [{ parts: [{ text: `${buildPrompt(prompt)}\n\nNegative prompt: ${getNegativePrompt()}` }] }],
    generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
  }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
  const parts = res.data.candidates[0].content.parts;
  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart) throw new Error('Google AI returned no image');
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

async function generateImagePollinations(prompt) {
  const model = env.POLLINATIONS_MODEL || 'flux-pro';
  const token = env.POLLINATIONS_TOKEN ? `&token=${env.POLLINATIONS_TOKEN}` : '';
  const negative = `&negative=${encodeURIComponent(getNegativePrompt())}`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(buildPrompt(prompt))}?width=1080&height=1080&model=${model}&nologo=true&enhance=true&steps=35${negative}${token}`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 150000 });
  return Buffer.from(res.data);
}

run().catch(err => {
  console.error('PREVIEW FAILED:', err);
  process.exit(1);
});
