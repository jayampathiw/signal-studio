import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseFlags, requireFlag } from './args.ts';

test('parseFlags: --flag value pairs', () => {
  assert.deepEqual(parseFlags(['--manifest', 'm.json', '--out', 'out/']), {
    manifest: 'm.json',
    out: 'out/',
  });
});

test('parseFlags: --flag=value form', () => {
  assert.deepEqual(parseFlags(['--manifest=m.json']), { manifest: 'm.json' });
});

test('parseFlags: boolean flag when followed by nothing or another flag', () => {
  assert.deepEqual(parseFlags(['--json']), { json: true });
  assert.deepEqual(parseFlags(['--json', '--level', 'debug']), { json: true, level: 'debug' });
});

test('requireFlag: throws a clear error when missing', () => {
  assert.throws(() => requireFlag({}, 'manifest'), /Missing required flag: --manifest/);
});

test('requireFlag: returns the string value when present', () => {
  assert.equal(requireFlag({ manifest: 'm.json' }, 'manifest'), 'm.json');
});
