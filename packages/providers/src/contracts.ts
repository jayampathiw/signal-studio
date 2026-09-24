import { z } from 'zod';

/**
 * Provider interfaces (P1.6), per refactor-plan.md §2.4 — fixed and small on
 * purpose. Each capability is a TS interface for the call shape, plus a zod
 * schema for its return shape (so a real provider's response can be
 * validated the same way a manifest is). Concrete providers (llm-anthropic,
 * tts-kokoro-js, image-fal, etc.) implement these in P3.4/P2.4; this package
 * only defines the contract and the `fakes/` used by tests and CI.
 */

// ---- LLM ----

export const LlmResult = z.object({
  text: z.string().optional(),
  json: z.unknown().optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }),
});
export type LlmResultT = z.infer<typeof LlmResult>;

// P3.6 addition — a plain string is still the common case, but the `qa`
// stage's optional vision spot-check needs to send image content blocks
// too. Widened to Anthropic's own real Messages API content-block shape
// (a subset — just the two block types this repo actually sends) rather
// than a bespoke one, since `llm-anthropic.ts` forwards `content` verbatim
// into the request body with no translation step.
export type LlmContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export type LlmMessage = {
  role: 'user' | 'assistant';
  content: string | LlmContentBlock[];
};

export interface LlmProvider {
  complete(args: {
    system?: string;
    messages: LlmMessage[];
    schema?: unknown;
  }): Promise<LlmResultT>;
}

// ---- TTS ----

export const TtsResult = z.object({
  wavPath: z.string(),
  durationSec: z.number().positive(),
});
export type TtsResultT = z.infer<typeof TtsResult>;

export interface TtsProvider {
  synthesise(args: { text: string; voice: string; speed: number }): Promise<TtsResultT>;
}

// ---- Captions (word timings) ----

export const WordTiming = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
});
export type WordTimingT = z.infer<typeof WordTiming>;

export interface CaptionsProvider {
  wordTimings(args: { wavPath: string; hintText?: string }): Promise<WordTimingT[]>;
}

// ---- Image ----

export const ImageResult = z.object({
  path: z.string().optional(),
  url: z.string().optional(),
});
export type ImageResultT = z.infer<typeof ImageResult>;

export interface ImageProvider {
  generate(args: { prompt: string; aspect: string; size?: string }): Promise<ImageResultT>;
}

// ---- Stock footage ----

export const StockResult = z.object({
  url: z.string(),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type StockResultT = z.infer<typeof StockResult>;

export interface StockProvider {
  search(args: {
    query: string;
    orientation: string;
    minDuration?: number;
  }): Promise<StockResultT[]>;
}

// ---- Storage ----

export const StorageResult = z.object({ url: z.string() });
export type StorageResultT = z.infer<typeof StorageResult>;

export interface StorageProvider {
  put(args: { localPath: string; key: string }): Promise<StorageResultT>;
  signedUrl(key: string): Promise<string>;
  presignUpload(key: string): Promise<string>;
}

// ---- Publish ----

export const PublishResult = z.object({
  postId: z.string(),
  url: z.string().optional(),
});
export type PublishResultT = z.infer<typeof PublishResult>;

export interface PublishProvider {
  post(args: {
    platform: string;
    pageRef: string;
    video: string;
    caption: string;
    scheduleAt?: string;
    // P3.5 additions — additive/optional, existing callers unaffected.
    title?: string;
    // Real, currently-documented AI-disclosure flag for YouTube
    // (`status.containsSyntheticMedia` on the Video resource — verified
    // against Google's own discovery doc, not guessed). **No equivalent
    // exists in Meta's Graph API for a Page video post** — Facebook's
    // AI-disclosure is a manual Meta Business Suite step, not an API
    // parameter (see `publish-facebook.ts`'s own header); this flag is
    // simply ignored there, not silently mis-mapped to something else.
    aiDisclosure?: boolean;
  }): Promise<PublishResultT>;
}

/**
 * `NotImplementedProvider` is the explicit stand-in for launch-set gaps
 * (Instagram/TikTok per §2.4) — it must fail at **validation** time (when a
 * project/manifest resolves to it), not mid-run. Any provider role can wrap
 * this instead of a real implementation.
 */
export class NotImplementedProviderError extends Error {
  constructor(role: string, providerId: string) {
    super(`Provider "${providerId}" for role "${role}" is not implemented yet.`);
    this.name = 'NotImplementedProviderError';
  }
}

export function assertImplemented(
  role: string,
  providerId: string,
  implemented: Set<string>,
): void {
  if (!implemented.has(providerId)) {
    throw new NotImplementedProviderError(role, providerId);
  }
}
