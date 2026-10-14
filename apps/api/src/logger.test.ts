import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createLogger } from './logger.ts';

test('createLogger: JSON mode writes real NDJSON to stdout (P4.3 — pino JSON → stdout)', () => {
  const chunks: string[] = [];
  const realWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    chunks.push(chunk);
    return true;
  }) as typeof process.stdout.write;

  try {
    const logger = createLogger({ json: true, level: 'info' });
    logger.info('job completed', { jobId: 'job-1' });
  } finally {
    process.stdout.write = realWrite;
  }

  assert.equal(chunks.length, 1);
  const parsed = JSON.parse(chunks[0]);
  assert.equal(parsed.msg, 'job completed');
  assert.equal(parsed.jobId, 'job-1');
  assert.equal(parsed.level, 30); // pino's numeric level for 'info'
});

test('createLogger: JSON mode respects the level threshold (debug suppressed at info level)', () => {
  const chunks: string[] = [];
  const realWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    chunks.push(chunk);
    return true;
  }) as typeof process.stdout.write;

  try {
    const logger = createLogger({ json: true, level: 'info' });
    logger.debug('should not appear');
    logger.error('should appear');
  } finally {
    process.stdout.write = realWrite;
  }

  assert.equal(chunks.length, 1);
  assert.equal(JSON.parse(chunks[0]).msg, 'should appear');
});

test('createLogger: text mode (default) writes to stderr via console.error, unchanged from before', () => {
  const calls: unknown[][] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void calls.push(args);

  try {
    const logger = createLogger({ level: 'warn' });
    logger.debug('suppressed');
    logger.warn('a warning', { code: 42 });
  } finally {
    console.error = realError;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '[warn] a warning {"code":42}');
});
