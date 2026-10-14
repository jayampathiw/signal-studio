import assert from 'node:assert/strict';
import type { ZodTypeAny } from 'zod';

import {
  ImageResult,
  LlmResult,
  PublishResult,
  StockResult,
  StorageResult,
  TtsResult,
  WordTiming,
} from './contracts.ts';

/**
 * P1.6 follow-up — every provider's own test file (`llm-anthropic.test.ts`,
 * `tts-kokoro-js.test.ts`, etc.) hand-rolls the same
 * `assert.equal(SomeResult.safeParse(x).success, true)` check against its
 * role's zod schema. This is that check, written once, so a real provider's
 * test can validate its result against the exact same contract a fake's
 * result is validated against (`fakes/fakes.test.ts`) without repeating the
 * assertion shape everywhere.
 */
export const CONTRACT_SCHEMAS = {
  llm: LlmResult,
  tts: TtsResult,
  // Captions/stock providers return arrays — `WordTiming`/`StockResult` are
  // each array element's schema, checked per-item via
  // `assertEachMatchesContract`, not the array itself.
  captions: WordTiming,
  image: ImageResult,
  stock: StockResult,
  storage: StorageResult,
  publish: PublishResult,
} as const;

export type ContractRole = keyof typeof CONTRACT_SCHEMAS;

export function assertMatchesContract<T>(role: ContractRole, value: T): T {
  const schema = CONTRACT_SCHEMAS[role] as ZodTypeAny;
  const result = schema.safeParse(value);
  if (!result.success) {
    assert.fail(`${role} result failed its contract: ${JSON.stringify(result.error.issues)}`);
  }
  return value;
}

export function assertEachMatchesContract<T>(role: ContractRole, values: T[]): T[] {
  for (const value of values) assertMatchesContract(role, value);
  return values;
}
