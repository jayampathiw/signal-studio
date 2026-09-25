import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createErrorReporter } from './sentry.ts';

test('createErrorReporter: returns undefined (not a no-op) when no DSN is set', () => {
  assert.equal(createErrorReporter(undefined), undefined);
  assert.equal(createErrorReporter(''), undefined);
});

test('createErrorReporter: returns a real reporter function when a DSN is set', () => {
  const reporter = createErrorReporter('http://fake@localhost:9/1');
  assert.equal(typeof reporter, 'function');
});
