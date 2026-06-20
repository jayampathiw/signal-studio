import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { SOURCES } from '../config/sources.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 4 levels up from apps/news/src/enrich/ reaches the monorepo root
const ASSETS_DIR = resolve(__dirname, '../../../../assets');
const antonFontB64 = readFileSync(resolve(ASSETS_DIR, 'fonts/Anton-Regular.ttf')).toString('base64');

// Anton condensed font: ~0.58 char width per em (empirical for uppercase-heavy news headlines)
const ANTON_CHAR_RATIO = 0.58;

function splitHeadline(headline) {
  if (!headline) return [''];
  if (headline.length <= 20) return [headline];

  const mid = Math.floor(headline.length / 2);
  let before = -1, after = -1;
  for (let i = mid; i >= 0; i--) { if (headline[i] === ' ') { before = i; break; } }
  for (let i = mid; i < headline.length; i++) { if (headline[i] === ' ') { after = i; break; } }

  if (before === -1 && after === -1) return [headline];
  const split = (after !== -1 && (before === -1 || Math.abs(after - mid) <= Math.abs(before - mid))) ? after : before;
  return [headline.slice(0, split), headline.slice(split + 1)];
}

function computeFontSize(w, lines) {
  const base = Math.round(w * 0.082);
  const maxLineChars = Math.max(...lines.map(l => l.length));
  const safeWidth = w * 0.92;
  const estimatedWidth = maxLineChars * base * ANTON_CHAR_RATIO;
  if (estimatedWidth <= safeWidth) return base;
  return Math.max(Math.round(w * 0.042), Math.round(base * safeWidth / estimatedWidth));
}

function escapeXml(s) {
  return (s || '').replace(/[<>&"']/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] ?? c)
  );
}

export async function compositeImage(imageBuffer, headline, country) {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1080;
  const h = meta.height ?? 1080;

  const lines = splitHeadline(headline);
  const fontSize = computeFontSize(w, lines);
  const lineHeight = Math.round(fontSize * 1.28);
  const padV = Math.round(fontSize * 0.5);
  const padH = Math.round(w * 0.045);
  const boxH = padV + lines.length * lineHeight + padV;

  const strokeW = Math.round(fontSize * 0.06);
  const textElements = lines.map((line, i) => {
    const y = padV + Math.round(fontSize * 0.82) + i * lineHeight;
    return `<text x="${Math.round(w / 2)}" y="${y}" font-family="Anton" font-size="${fontSize}" fill="white" text-anchor="middle" stroke="white" stroke-width="${strokeW}" stroke-linejoin="round" paint-order="stroke fill">${escapeXml(line)}</text>`;
  }).join('\n      ');

  const overlaySvg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>@font-face { font-family: 'Anton'; src: url('data:font/ttf;base64,${antonFontB64}'); }</style>
      </defs>
      <rect x="0" y="0" width="${w}" height="${boxH}" fill="black" fill-opacity="0.65"/>
      ${textElements}
    </svg>`
  );

  const watermarkFile = SOURCES[country]?.watermarkFile ?? `${country}_Logo.png`;
  const logoPath = resolve(ASSETS_DIR, `logos/${watermarkFile}`);
  let logoBuffer = null;
  try {
    const logoRaw = await sharp(logoPath).resize(Math.round(w * 0.15)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = logoRaw;
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * 0.7);
    logoBuffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  } catch {
    console.warn(`  No logo found at ${logoPath} — skipping watermark`);
  }

  const composites = [{ input: overlaySvg, top: 0, left: 0 }];
  if (logoBuffer) composites.push({ input: logoBuffer, gravity: 'southeast', blend: 'over' });

  return sharp(imageBuffer).composite(composites).png().toBuffer();
}
