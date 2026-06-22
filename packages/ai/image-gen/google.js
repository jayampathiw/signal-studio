import { env } from '@signal-studio/config';

/**
 * Generate an image using Google AI Studio (last-resort fallback).
 * Requires billing enabled on GCP for Imagen 4; Gemini Flash image gen is free-tier.
 *
 * @param {string} prompt
 * @returns {Promise<string>} image URL or data URL
 */
export async function generateWithGoogle(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${env.GOOGLE_AI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google AI failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Google AI returned no image data');
  return `data:image/png;base64,${b64}`;
}
