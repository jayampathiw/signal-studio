import type { CarouselOutputT } from '@signal-studio/core/schemas';

/**
 * P3.3 — the `carousel` template's `compile()`: ported from
 * `apps/video/scripts/policy-file/render-carousel.mjs`'s own
 * `carousel.json` → `CarouselSlide` inputProps mapping. Trivially pure,
 * unlike every other template's `compile()` so far — a carousel slide has
 * no measured-duration dependency at all (no VO, no Whisper, no ffprobe),
 * so there's nothing for the caller to pre-resolve; this function is just a
 * straight, validated field mapping.
 */

export type CarouselCompileSlideInput = {
  headline: string;
  body?: string;
  showFolder?: boolean;
};

export type CarouselCompileParams = {
  contentId: string;
  slides: CarouselCompileSlideInput[];
  watermarkPath?: string;
};

export class CarouselCompileError extends Error {}

export function compile(params: CarouselCompileParams): CarouselOutputT {
  if (!params.slides.length) {
    throw new CarouselCompileError(`${params.contentId}: carousel has no slides`);
  }

  return {
    contentId: params.contentId,
    template: 'carousel',
    slides: params.slides.map((s) => ({
      headline: s.headline,
      body: s.body,
      showFolder: s.showFolder ?? false,
    })),
    watermarkPath: params.watermarkPath,
  };
}
