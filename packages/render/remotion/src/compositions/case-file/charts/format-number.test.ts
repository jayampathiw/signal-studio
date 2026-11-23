import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCount } from './format-number.ts';

test('adds thousands separators', () => {
  assert.equal(formatCount(10000), '10,000');
  assert.equal(formatCount(418000), '418,000');
  assert.equal(formatCount(1234567), '1,234,567');
});

test('leaves small numbers and decimals alone', () => {
  assert.equal(formatCount(95), '95');
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(7.1), '7.1');
  assert.equal(formatCount(1500.25), '1,500.25');
});
