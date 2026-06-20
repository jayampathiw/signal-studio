/**
 * Server-side image compositing for news article thumbnails.
 * Applies: gradient overlay, Anton font headline, watermark (bottom-right, 70% opacity).
 *
 * This runs in Node.js (not the browser). For the Angular dashboard, compositing
 * is done in the browser via Canvas API (dashboard/src/app — unchanged from old repo).
 *
 * TODO: implement using 'sharp' + 'canvas' (node-canvas) npm packages during migration.
 * Reference: facebook-news-pipeline/dashboard/src/app/services/image-composite.service.ts
 *
 * @param {{ imageUrl: string, headline: string, watermarkPath: string }} opts
 * @param {string} outputPath
 * @returns {Promise<string>} outputPath
 */
export async function compositeNewsImage({ imageUrl, headline, watermarkPath }, outputPath) {
  throw new Error('TODO: implement server-side compositing with sharp + canvas');
}
