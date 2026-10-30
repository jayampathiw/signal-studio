import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tidyCaptionWords } from './caption-words.ts';

// One word per second, so merged timings are easy to read.
function timed(...texts: string[]) {
  return texts.map((text, i) => ({ text, start: i, end: i + 1 }));
}

function texts(words: Array<{ text: string }>) {
  return words.map((w) => w.text);
}

test('rejoins Whisper hyphen pieces and turns a spoken year into figures', () => {
  // Real tokens from job 9c68674f's first scene.
  const out = tidyCaptionWords(
    timed(
      'in',
      'June',
      'twenty',
      '-twenty',
      '-four,',
      'plans',
      'reversed',
      'ninety',
      '-five',
      'percent',
      'of',
    ),
  );
  assert.deepEqual(texts(out), ['in', 'June', '2024,', 'plans', 'reversed', '95%', 'of']);
  assert.deepEqual(out[2], { text: '2024,', start: 2, end: 5 });
  assert.deepEqual(out[5], { text: '95%', start: 7, end: 10 });
});

test('percent, dollars and decimals', () => {
  assert.deepEqual(texts(tidyCaptionWords(timed('only', 'eighteen', 'percent.'))), [
    'only',
    '18%.',
  ]);
  assert.deepEqual(
    texts(
      tidyCaptionWords(
        timed('four', 'hundred', 'eighteen', 'thousand', 'one', 'hundred', 'forty-one', 'dollars'),
      ),
    ),
    ['$418,141'],
  );
  assert.deepEqual(texts(tidyCaptionWords(timed('seven-point-one', 'percent'))), ['7.1%']);
  assert.deepEqual(texts(tidyCaptionWords(timed('two', 'million', 'dollars'))), ['$2 million']);
  assert.deepEqual(texts(tidyCaptionWords(timed('five', 'percent'))), ['5%']);
});

test('plain numbers of ten or more become figures; small counts stay words', () => {
  assert.deepEqual(texts(tidyCaptionWords(timed('the', 'nineteen', 'largest'))), [
    'the',
    '19',
    'largest',
  ]);
  assert.deepEqual(texts(tidyCaptionWords(timed('one', 'in', 'three', 'appealed'))), [
    'one',
    'in',
    'three',
    'appealed',
  ]);
  assert.deepEqual(texts(tidyCaptionWords(timed('in', 'two', 'thousand', 'nineteen'))), [
    'in',
    '2019',
  ]);
});

test('punctuation ends a number; unknown shapes are left alone', () => {
  assert.deepEqual(texts(tidyCaptionWords(timed('forty,', 'eleven'))), ['40,', '11']);
  assert.deepEqual(texts(tidyCaptionWords(timed('a', 'hundred', 'times'))), [
    'a',
    'hundred',
    'times',
  ]);
  assert.deepEqual(texts(tidyCaptionWords(timed('evidence', '-based', 'care'))), [
    'evidence-based',
    'care',
  ]);
  assert.deepEqual(texts(tidyCaptionWords(timed('Already', '95%', 'here'))), [
    'Already',
    '95%',
    'here',
  ]);
});
