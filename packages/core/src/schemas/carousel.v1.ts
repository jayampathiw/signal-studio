import { z } from 'zod';

/**
 * P3.3 — the `carousel` template's output shape. Deliberately NOT a
 * `Timeline` (timeline.v1.ts's own schema is video-shaped: `scenes[]` each
 * with a `durationSecs`, plus audio/music concepts) — a carousel is N
 * independent still PNGs with no narration, no audio, no duration math at
 * all, per `render-carousel.mjs`'s own header rationale ("reusing the video
 * pipeline... would be forcing a video-shaped tool onto a fundamentally
 * different output"). Forcing this through `Timeline` would mean every
 * slide carrying a meaningless `durationSecs`/`sceneType` just to satisfy a
 * schema shape it doesn't need — a new, minimal, additive schema instead,
 * matching the plan's own "outputs[] with kind: image" hint.
 */

export const CarouselSlide = z.object({
  headline: z.string(),
  body: z.string().optional(),
  // Brand motif (the folder graphic) shown on the hook/CTA slides — ported
  // unchanged from render-carousel.mjs's own per-slide `showFolder` flag.
  showFolder: z.boolean().default(false),
});

export const CarouselOutput = z.object({
  contentId: z.string(),
  template: z.literal('carousel'),
  slides: z.array(CarouselSlide).min(1),
  watermarkPath: z.string().optional(),
});

export type CarouselSlideT = z.infer<typeof CarouselSlide>;
export type CarouselOutputT = z.infer<typeof CarouselOutput>;
