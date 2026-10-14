import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compile, CarouselCompileError } from './compile.ts';

test('maps slides straight through, defaulting showFolder to false', () => {
  const out = compile({
    contentId: 'appeal-playbook-7-days',
    slides: [{ headline: 'Step 1' }, { headline: 'Step 2', body: 'Details', showFolder: true }],
  });
  assert.equal(out.template, 'carousel');
  assert.equal(out.slides.length, 2);
  assert.equal(out.slides[0].showFolder, false);
  assert.equal(out.slides[1].body, 'Details');
  assert.equal(out.slides[1].showFolder, true);
});

test('watermarkPath passes through when supplied, omitted otherwise', () => {
  const withWm = compile({
    contentId: 'x',
    slides: [{ headline: 'a' }],
    watermarkPath: '/assets/logo.png',
  });
  assert.equal(withWm.watermarkPath, '/assets/logo.png');

  const withoutWm = compile({ contentId: 'x', slides: [{ headline: 'a' }] });
  assert.equal(withoutWm.watermarkPath, undefined);
});

test('no slides throws CarouselCompileError', () => {
  assert.throws(() => compile({ contentId: 'x', slides: [] }), CarouselCompileError);
});
