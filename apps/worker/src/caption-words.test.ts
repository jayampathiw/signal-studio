import assert from 'node:assert/strict';
import { test } from 'node:test';

import { scriptTimedWords, tidyCaptionWords } from './caption-words.ts';

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

test('spelled-out acronyms become one caption word', () => {
  assert.deepEqual(texts(tidyCaptionWords(timed('the', 'F', 'T', 'C', 'says'))), [
    'the',
    'FTC',
    'says',
  ]);
  assert.deepEqual(tidyCaptionWords(timed('F', 'B', 'I.'))[0], { text: 'FBI.', start: 0, end: 3 });
  assert.deepEqual(texts(tidyCaptionWords(timed('at', 'A', 'T', 'Ms', 'today'))), [
    'at',
    'ATMs',
    'today',
  ]);
  assert.deepEqual(texts(tidyCaptionWords(timed('the', 'F-T-C', 'says'))), ['the', 'FTC', 'says']);
  assert.deepEqual(texts(tidyCaptionWords(timed('Plan', 'A.', 'I', 'agree'))), [
    'Plan',
    'A.',
    'I',
    'agree',
  ]);
});

test('captions show the script and take their timing from Whisper', () => {
  // Whisper misheard the number and dropped a letter; the script wins.
  const heard = [
    { text: 'The', start: 0.0, end: 0.2 },
    { text: 'F', start: 0.2, end: 0.4 },
    { text: 'C', start: 0.6, end: 0.8 },
    { text: 'lost', start: 0.8, end: 1.1 },
    { text: '20', start: 1.1, end: 1.5 },
    { text: 'billion.', start: 1.5, end: 2.0 },
  ];
  const words = scriptTimedWords('The F T C lost three billion.', heard, 3);
  assert.deepEqual(texts(words), ['The', 'F', 'T', 'C', 'lost', 'three', 'billion.']);
  assert.deepEqual(words[5], { text: 'three', start: 1.1, end: 1.5 });
  // "T" was missed, so it sits between the letters either side of it.
  assert.deepEqual(words[2], { text: 'T', start: 0.4, end: 0.6 });
  assert.deepEqual(texts(tidyCaptionWords(words)), ['The', 'FTC', 'lost', '3 billion.']);

  // Words Whisper heard that the script lacks stretch the word before them.
  const stretched = scriptTimedWords(
    'Call now',
    [
      { text: 'Call', start: 0, end: 0.3 },
      { text: 'um', start: 0.3, end: 0.6 },
      { text: 'now', start: 0.6, end: 1 },
    ],
    1.5,
  );
  assert.deepEqual(stretched, [
    { text: 'Call', start: 0, end: 0.6 },
    { text: 'now', start: 0.6, end: 1 },
  ]);

  // Script words after Whisper's last word fill the rest of the audio.
  const tail = scriptTimedWords('one two three four', [{ text: 'one', start: 0, end: 1 }], 4);
  assert.deepEqual(
    tail.map((w) => [w.start, w.end]),
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  );
});
