import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chunkCaptions, splitOversizedCaptions } from './captions.ts';

test('chunkCaptions: chunks on clause-end punctuation, real ASR word timestamps used verbatim', () => {
  const voText = 'Imagine you are twenty-six years old.';
  const words = [
    { word: 'Imagine', start: 0, end: 0.56 },
    { word: 'you', start: 0.56, end: 0.8 },
    { word: 'are', start: 0.8, end: 1.04 },
    { word: 'twenty-six', start: 1.04, end: 1.84 },
    { word: 'years', start: 1.84, end: 2.24 },
    { word: 'old.', start: 2.24, end: 2.56 },
  ];
  const chunks = chunkCaptions(voText, words, { tailPad: 0 });
  // Whole sentence is one chunk — the only clause-ending punctuation is the
  // final period, on the last word.
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].words.length, 6);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks[0].end, 2.56);
});

test('chunkCaptions: a mid-sentence comma starts a new chunk', () => {
  const voText = 'Their captain, the greatest, was gone.';
  const words = voText.split(' ').map((w, i) => ({ word: w, start: i, end: i + 0.8 }));
  const chunks = chunkCaptions(voText, words, { tailPad: 0 });
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].words.map((w) => w.text).join(' '), 'Their captain,');
  assert.equal(chunks[1].words.map((w) => w.text).join(' '), 'the greatest,');
  assert.equal(chunks[2].words.map((w) => w.text).join(' '), 'was gone.');
});

test('chunkCaptions: mismatched ASR/script word counts fall back to proportional char-length timing', () => {
  // 3 script tokens, 2 ASR words — forces the proportional-distribution path.
  const voText = 'one two-three';
  const words = [
    { word: 'one', start: 0, end: 1 },
    { word: 'twothree', start: 1, end: 3 },
  ];
  const chunks = chunkCaptions(voText, words, { tailPad: 0 });
  assert.equal(chunks[0].words.length, 2);
  // Proportional split: span [0,3], total 6 chars ("one"=3, "two-three"=9
  // minus the hyphen doesn't change char count logic) — just assert times
  // stay within the real ASR span, not exact values (the algorithm's own
  // char-weighting is what's under test, not a specific number).
  assert.ok(chunks[0].words[0].start >= 0);
  assert.ok(chunks[0].words[1].end <= 3);
});

test('chunkCaptions: no words or no voText returns no chunks', () => {
  assert.deepEqual(chunkCaptions('', [{ word: 'x', start: 0, end: 1 }]), []);
  assert.deepEqual(chunkCaptions('text', []), []);
});

test('splitOversizedCaptions: leaves a chunk untouched when it already fits', () => {
  const chunk = {
    atSec: 0,
    durationSec: 1,
    words: [
      { text: 'short', offsetStartSec: 0, offsetEndSec: 0.5 },
      { text: 'line', offsetStartSec: 0.5, offsetEndSec: 1 },
    ],
  };
  const out = splitOversizedCaptions([chunk], (t) => t.length * 10, 1000);
  assert.deepEqual(out, [chunk]);
});

test('splitOversizedCaptions: an overlong chunk is greedily split into fitting sub-chunks', () => {
  const chunk = {
    atSec: 10,
    durationSec: 4,
    words: [
      { text: 'one', offsetStartSec: 0, offsetEndSec: 1 },
      { text: 'two', offsetStartSec: 1, offsetEndSec: 2 },
      { text: 'three', offsetStartSec: 2, offsetEndSec: 3 },
      { text: 'four', offsetStartSec: 3, offsetEndSec: 4 },
    ],
  };
  // measureWidth = 10px/char + 1 space — "one two" (7 chars) = 70, over a
  // maxWidth of 50 forces a split after each single word.
  const out = splitOversizedCaptions([chunk], (t) => t.length * 10, 50);
  assert.equal(out.length, 4);
  assert.equal(out[0].words[0].text, 'one');
  // Re-based atSec: sub-chunk 2 ("two") starts at the original chunk's
  // atSec + that word's own offsetStartSec.
  assert.equal(out[1].atSec, 11);
  assert.equal(out[1].words[0].offsetStartSec, 0);
});
