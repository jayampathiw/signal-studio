import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { submit, poll } from './higgsfield.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const shotlist = readFileSync(resolve(projectRoot, 'temp/longform/silenced-shotlist.md'), 'utf8');
const artMatch = shotlist.match(/GLOBAL ART DIRECTION[^\n]*\n\n([^\n]+)/);
const ART_DIRECTION = artMatch?.[1] ?? '';

function fullPrompt(prompt) {
  return ART_DIRECTION ? `${ART_DIRECTION}\n\n${prompt}` : prompt;
}

/**
 * Generate a still image via Higgsfield Soul V2.
 * Soul V2 max 1 reference image — enforced by API.
 * @param {{ prompt: string, referenceMediaId?: string, aspectRatio?: string }} opts
 * @returns {Promise<{ jobId: string, url: string }>}
 */
export async function generateStill({ prompt, referenceMediaId, aspectRatio = '16:9' }) {
  const params = {
    prompt: fullPrompt(prompt),
    aspect_ratio: aspectRatio,
    quality: '2k',
    ...(referenceMediaId ? { image_references: referenceMediaId } : {}),
  };
  const jobId = await submit('text2image_soul_v2', params);
  const { url } = await poll(jobId);
  return { jobId, url };
}

/**
 * Generate a precision still via nano_banana_2 — accepts multiple reference images.
 * Used for scenes requiring text accuracy or multi-ref conditioning.
 * @param {{ prompt: string, referenceMediaIds?: string[], aspectRatio?: string }} opts
 * @returns {Promise<{ jobId: string, url: string }>}
 */
export async function generatePrecisionStill({
  prompt,
  referenceMediaIds = [],
  aspectRatio = '16:9',
}) {
  const params = {
    prompt: fullPrompt(prompt),
    aspect_ratio: aspectRatio,
    ...(referenceMediaIds.length ? { image_references: referenceMediaIds } : {}),
  };
  const jobId = await submit('nano_banana_2', params);
  const { url } = await poll(jobId);
  return { jobId, url };
}

export default { generateStill, generatePrecisionStill };
