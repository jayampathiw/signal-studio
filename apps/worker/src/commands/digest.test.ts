import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digestCommand, formatDigest } from './digest.ts';
import { createLogger } from '../logger.ts';

test('formatDigest: includes all three counts, omits Actions minutes when null', () => {
  const text = formatDigest({ failed: 2, awaitingReview: 1, delivered: 10 }, null);
  assert.match(text, /failed: 2/);
  assert.match(text, /awaiting review: 1/);
  assert.match(text, /delivered: 10/);
  assert.doesNotMatch(text, /Actions minutes/);
});

test('formatDigest: includes Actions minutes when given', () => {
  const text = formatDigest({ failed: 0, awaitingReview: 0, delivered: 0 }, 42);
  assert.match(text, /GitHub Actions minutes used \(this cycle\): 42/);
});

test('digestCommand: logs the counts, no channel configured -> logged-only, still succeeds', async () => {
  const logs: string[] = [];
  const logger = createLogger({ level: 'error' });
  const loggerSpy = {
    ...logger,
    info: (message: string) => logs.push(message),
  };

  await digestCommand(
    { orgId: 'org-1' },
    { countsByStatus: async () => ({ failed: 1, awaitingReview: 0, delivered: 5 }) },
    loggerSpy,
  );

  assert.ok(logs.some((m) => m === 'digest computed'));
  assert.ok(logs.some((m) => m.includes('logged only')));
});

test('digestCommand: sends via both Telegram and email when both are configured', async () => {
  const telegramCalls: string[] = [];
  const emailCalls: Array<{ subject: string; text: string }> = [];

  await digestCommand(
    { orgId: 'org-1' },
    {
      countsByStatus: async () => ({ failed: 1, awaitingReview: 0, delivered: 5 }),
      sendTelegram: async (text) => void telegramCalls.push(text),
      sendEmail: async (subject, text) => void emailCalls.push({ subject, text }),
    },
    createLogger({ level: 'error' }),
  );

  assert.equal(telegramCalls.length, 1);
  assert.match(telegramCalls[0], /failed: 1/);
  assert.equal(emailCalls.length, 1);
  assert.equal(emailCalls[0].subject, 'signal-studio daily digest');
});

test('digestCommand: a failed Telegram send does not stop email from being attempted, or throw', async () => {
  const emailCalls: string[] = [];
  await digestCommand(
    { orgId: 'org-1' },
    {
      countsByStatus: async () => ({ failed: 0, awaitingReview: 0, delivered: 0 }),
      sendTelegram: async () => {
        throw new Error('telegram api down');
      },
      sendEmail: async (subject) => void emailCalls.push(subject),
    },
    createLogger({ level: 'error' }),
  );
  assert.equal(emailCalls.length, 1);
});

test('digestCommand: a failed getActionsMinutesUsed omits that line but does not fail the digest', async () => {
  const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const logger = createLogger({ level: 'error' });
  const loggerSpy = {
    ...logger,
    info: (message: string, meta?: Record<string, unknown>) => logs.push({ message, meta }),
    warn: (message: string, meta?: Record<string, unknown>) => logs.push({ message, meta }),
  };

  await digestCommand(
    { orgId: 'org-1' },
    {
      countsByStatus: async () => ({ failed: 0, awaitingReview: 0, delivered: 0 }),
      getActionsMinutesUsed: async () => {
        throw new Error('403 missing user scope');
      },
    },
    loggerSpy,
  );

  const warned = logs.find((l) => l.message.includes('could not fetch GitHub Actions minutes'));
  assert.ok(warned);
  const computed = logs.find((l) => l.message === 'digest computed');
  assert.equal(computed?.meta?.actionsMinutesUsed, null);
});

test('digestCommand: includes real Actions minutes in the computed log when the fetch succeeds', async () => {
  const logs: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const logger = createLogger({ level: 'error' });
  const loggerSpy = {
    ...logger,
    info: (message: string, meta?: Record<string, unknown>) => logs.push({ message, meta }),
  };

  await digestCommand(
    { orgId: 'org-1' },
    {
      countsByStatus: async () => ({ failed: 0, awaitingReview: 0, delivered: 0 }),
      getActionsMinutesUsed: async () => 123,
    },
    loggerSpy,
  );

  const computed = logs.find((l) => l.message === 'digest computed');
  assert.equal(computed?.meta?.actionsMinutesUsed, 123);
});
