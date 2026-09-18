import type {
  CaptionsProvider,
  ImageProvider,
  LlmProvider,
  PublishProvider,
  StockProvider,
  StorageProvider,
  TtsProvider,
} from '../contracts.ts';

/**
 * `*-fake` providers (P1.6) — deterministic, no network, no filesystem
 * writes beyond an in-memory counter. Used by CI (`tts-fake` etc. per §2.4's
 * launch set) and by any test in this monorepo that needs a working
 * provider without hitting a real API.
 */

export const fakeLlmProvider: LlmProvider = {
  async complete({ messages }) {
    const lastUserMessage = messages.at(-1)?.content ?? '';
    return {
      text: `[fake completion for: ${lastUserMessage.slice(0, 40)}]`,
      usage: { inputTokens: lastUserMessage.length, outputTokens: 10 },
    };
  },
};

export const fakeTtsProvider: TtsProvider = {
  async synthesise({ text, speed }) {
    // Deterministic, roughly-plausible duration: ~150 words/min at speed 1.
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const durationSec = Math.max(0.5, ((words / 150) * 60) / speed);
    return { wavPath: `/fake/tts/${encodeURIComponent(text.slice(0, 20))}.wav`, durationSec };
  },
};

export const fakeCaptionsProvider: CaptionsProvider = {
  async wordTimings({ hintText }) {
    const words = (hintText ?? '').trim().split(/\s+/).filter(Boolean);
    const perWord = 0.3;
    return words.map((text, i) => ({ text, start: i * perWord, end: (i + 1) * perWord }));
  },
};

export const fakeImageProvider: ImageProvider = {
  async generate({ prompt }) {
    return { path: `/fake/images/${encodeURIComponent(prompt.slice(0, 20))}.png` };
  },
};

export const fakeStockProvider: StockProvider = {
  async search({ query }) {
    return [{ url: `https://fake.stock/${encodeURIComponent(query)}.mp4`, meta: { fake: true } }];
  },
};

export const fakeStorageProvider: StorageProvider = {
  async put({ key }) {
    return { url: `https://fake.storage/${key}` };
  },
  async signedUrl(key) {
    return `https://fake.storage/${key}?signed=1`;
  },
  async presignUpload(key) {
    return `https://fake.storage/${key}?upload=1`;
  },
};

export const fakePublishProvider: PublishProvider = {
  async post({ platform }) {
    return { postId: `fake-${platform}-${Date.now()}`, url: `https://fake.social/${platform}` };
  },
};
