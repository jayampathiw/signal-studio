import { z } from 'zod';

import type { LlmProvider } from '@signal-studio/providers/contracts';

import { extractSampleFrames } from './qa-measure.ts';

const VisionResult = z.object({
  ok: z.boolean(),
  notes: z.string(),
});

/**
 * Real vision spot-check, gated behind `project.qa.visionCheck` — samples 3
 * frames and asks `llm-anthropic` (real Claude vision) whether anything
 * looks visibly broken. Heuristic, not ground truth — `qa.ts`'s own stage
 * treats a flagged result as a warning, never a hard failure, on purpose.
 */
export function createVisionCheck(llm: LlmProvider) {
  return async function visionCheck(mp4Path: string): Promise<{ ok: boolean; notes: string }> {
    const frames = await extractSampleFrames(mp4Path, 3);
    const result = await llm.complete({
      system:
        'You are a QA reviewer for short-form video content. You will see 3 frames sampled ' +
        'from a rendered video. Flag only OBVIOUS rendering defects — a black/blank frame, ' +
        'garbled or overlapping text, a badly corrupted/glitched image. Do NOT flag subjective ' +
        'framing, color, or content-quality opinions. Respond with JSON only.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Do any of these 3 frames show an obvious rendering defect?' },
            ...frames.map(
              (data) =>
                ({
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/png', data },
                }) as const,
            ),
            {
              type: 'text',
              text: 'Respond with JSON: {"ok": true|false, "notes": "<one sentence>"}. "ok": false only if you see a real defect.',
            },
          ],
        },
      ],
      schema: VisionResult,
    });
    if (!result.json) throw new Error('createVisionCheck: llm-anthropic returned no parsed JSON');
    return result.json as { ok: boolean; notes: string };
  };
}
