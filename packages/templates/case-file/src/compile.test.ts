import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compile, CaseFileCompileError, pointerCardLines } from './compile.ts';

function baseParams(overrides = {}) {
  return {
    contentId: 'case-001',
    caseId: 'case-001-denied-claim',
    scenes: [{ id: 'scene-1', imagePath: '/img/doc1.png', narrationText: 'The claim was denied.' }],
    findNarrationPath: () => null,
    narrationDurationSec: () => 0,
    transcribedWords: () => null,
    ...overrides,
  };
}

test('a silent scene (no narration) falls back to its authored durationSecs', () => {
  const timeline = compile(
    baseParams({
      scenes: [{ id: 'scene-1', durationSecs: 4, captionText: 'A static beat.' }],
    }),
  );
  assert.equal(timeline.scenes[0].durationSecs, 4);
  assert.equal(timeline.scenes[0].captionText, 'A static beat.');
  assert.equal(timeline.scenes[0].narrationPath, undefined);
});

test('a silent scene with no durationSecs at all falls back to 3s', () => {
  const timeline = compile(baseParams({ scenes: [{ id: 'scene-1' }] }));
  assert.equal(timeline.scenes[0].durationSecs, 3);
});

test('a narrated scene is sized to measured VO duration + tail padding + holdExtraSecs', () => {
  const timeline = compile(
    baseParams({
      scenes: [{ id: 'scene-1', durationSecs: 3, holdExtraSecs: 0.3 }],
      findNarrationPath: () => '/vo/scene-1.wav',
      narrationDurationSec: () => 5,
    }),
  );
  // 5 (VO) + 0.5 (tail) + 0.3 (hold) = 5.8
  assert.equal(timeline.scenes[0].durationSecs, 5.8);
  assert.equal(timeline.scenes[0].narrationPath, '/vo/scene-1.wav');
});

test('caption text is built from the real transcript, not the authored script, when narration exists', () => {
  const timeline = compile(
    baseParams({
      scenes: [{ id: 'scene-1', captionText: 'authored paraphrase' }],
      findNarrationPath: () => '/vo/scene-1.wav',
      narrationDurationSec: () => 2,
      transcribedWords: () => [
        { text: 'the', start: 0, end: 0.2 },
        { text: 'claim', start: 0.2, end: 0.6 },
      ],
    }),
  );
  assert.equal(timeline.scenes[0].captionText, 'the claim');
  assert.deepEqual(timeline.scenes[0].words, [
    { text: 'the', start: 0, end: 0.2 },
    { text: 'claim', start: 0.2, end: 0.6 },
  ]);
});

test('a scene with no imagePath omits source (composition carries the prior document forward)', () => {
  const timeline = compile(baseParams({ scenes: [{ id: 'scene-1', captionText: 'x' }] }));
  assert.equal(timeline.scenes[0].source, undefined);
});

test('highlight (singular) resolves fromFraction/toFraction against the measured durationSecs', () => {
  const timeline = compile(
    baseParams({
      scenes: [
        {
          id: 'scene-1',
          highlight: {
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
            fromFraction: 0.25,
            toFraction: 0.75,
          },
        },
      ],
      findNarrationPath: () => '/vo/scene-1.wav',
      narrationDurationSec: () => 4,
    }),
  );
  // durationSecs = 4 + 0.5 tail = 4.5
  const [h] = timeline.scenes[0].highlights ?? [];
  assert.equal(h?.fromSec, 0.25 * 4.5);
  assert.equal(h?.toSec, 0.75 * 4.5);
});

test('highlights (plural array) maps each entry independently', () => {
  const timeline = compile(
    baseParams({
      scenes: [
        {
          id: 'scene-1',
          durationSecs: 10,
          highlights: [
            { x: 0, y: 0, width: 0.1, height: 0.1, fromSec: 1, toSec: 2 },
            { x: 0.5, y: 0.5, width: 0.1, height: 0.1, fromSec: 3, toSec: 4 },
          ],
        },
      ],
    }),
  );
  assert.equal(timeline.scenes[0].highlights?.length, 2);
  assert.equal(timeline.scenes[0].highlights?.[1].fromSec, 3);
});

test('hideSourceOnScreen drops sourceCitation from caseMeta but leaves the field independently controllable', () => {
  const withHidden = compile(
    baseParams({ sourceCitation: 'Reuters, 2026', hideSourceOnScreen: true }),
  );
  assert.equal(withHidden.caseMeta?.sourceCitation, undefined);

  const withShown = compile(baseParams({ sourceCitation: 'Reuters, 2026' }));
  assert.equal(withShown.caseMeta?.sourceCitation, 'Reuters, 2026');
});

test('showOutro/specimen default true/false and pass through when set', () => {
  const defaults = compile(baseParams());
  assert.equal(defaults.caseMeta?.showOutro, true);
  assert.equal(defaults.caseMeta?.specimen, false);

  const overridden = compile(baseParams({ showOutro: false, specimen: true }));
  assert.equal(overridden.caseMeta?.showOutro, false);
  assert.equal(defaults.caseMeta?.autoZoom, false);
  assert.equal(compile(baseParams({ autoZoom: true })).caseMeta?.autoZoom, true);
  assert.equal(overridden.caseMeta?.specimen, true);
});

test('watermark is set from watermarkPath, defaulting opacity to 0.9', () => {
  const timeline = compile(baseParams({ watermarkPath: '/assets/logo.png' }));
  assert.deepEqual(timeline.watermark, {
    path: '/assets/logo.png',
    position: 'bottom-right',
    opacity: 0.9,
  });
});

test('no scenes throws CaseFileCompileError', () => {
  assert.throws(() => compile(baseParams({ scenes: [] })), CaseFileCompileError);
});

test('visual/waveformOverlay/zoomFrom/zoomTo pass through unchanged', () => {
  const timeline = compile(
    baseParams({
      scenes: [
        {
          id: 'scene-1',
          visual: { kind: 'counter', value: 42 },
          waveformOverlay: true,
          zoomFrom: { x: 0, y: 0, width: 1, height: 1 },
          zoomTo: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
        },
      ],
    }),
  );
  const scene = timeline.scenes[0];
  assert.deepEqual(scene.visual, { kind: 'counter', value: 42 });
  assert.equal(scene.waveformOverlay, true);
  assert.deepEqual(scene.zoomFrom, { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(scene.zoomTo, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 });
});

test('overlay_text on the first shot becomes a 3 s title, clipped to a shorter scene', () => {
  const t = compile(
    baseParams({
      scenes: [
        { id: 's1', durationSecs: 5, overlayText: ' Denied care, then a lawsuit ' },
        { id: 's2', durationSecs: 2 },
      ],
    }),
  );
  assert.deepEqual(t.scenes[0].overlay, {
    text: 'Denied care, then a lawsuit',
    inSec: 0,
    outSec: 3,
  });
  assert.equal(t.scenes[1].overlay, undefined);
  const short = compile(
    baseParams({ scenes: [{ id: 's1', durationSecs: 2, overlayText: 'Short opener' }] }),
  );
  assert.equal(short.scenes[0].overlay?.outSec, 2);
});

test('overlay_text over 7 words, or on a later shot, is refused', () => {
  assert.throws(
    () =>
      compile(
        baseParams({
          scenes: [{ id: 's1', overlayText: 'one two three four five six seven eight' }],
        }),
      ),
    (e: unknown) => e instanceof CaseFileCompileError && /8 words/.test((e as Error).message),
  );
  assert.throws(
    () => compile(baseParams({ scenes: [{ id: 's1' }, { id: 's2', overlayText: 'A title' }] })),
    (e: unknown) =>
      e instanceof CaseFileCompileError && /only the first shot/.test((e as Error).message),
  );
});

test('pointer cards: the guide example fits; one that wraps past 4 lines is refused', () => {
  assert.equal(
    pointerCardLines('Denied?\nAsk for the reason in writing.\nThen appeal.', '9:16'),
    3,
  );
  const long =
    'If your plan denies care, ask for the reason in writing.\nThen file an appeal within sixty days of the notice.\nKeep copies.';
  assert.ok(pointerCardLines(long, '9:16') > 4);
  assert.throws(
    () =>
      compile(
        baseParams({
          aspectRatio: '9:16',
          scenes: [{ id: 's3', visual: { kind: 'pointerCard', text: long } }],
        }),
      ),
    (e: unknown) => e instanceof CaseFileCompileError && /pointerCard/.test((e as Error).message),
  );
  assert.equal(pointerCardLines(long, '16:9'), 3);
});

test('opening highlight: one short line passes; wrapped, wide or long quotes are refused', () => {
  const opening = (highlights: object[], openingQuote: string) =>
    compile(
      baseParams({
        scenes: [
          { id: 's1', imagePath: '/img/p15.png', durationSecs: 5, highlights, openingQuote },
        ],
      }),
    );
  const line = { x: 0.3, y: 0.8, width: 0.25, height: 0.02, fromFraction: 0.1, toFraction: 1 };
  assert.doesNotThrow(() => opening([line], 'two and a half weeks'));
  // A later beat may wrap or run wide — only the first one is the cover.
  assert.doesNotThrow(() =>
    opening(
      [
        line,
        { ...line, x: 0.1, width: 0.8, fromFraction: 0.6 },
        { ...line, y: 0.82, fromFraction: 0.6 },
      ],
      'two and a half weeks',
    ),
  );
  const refused = (e: unknown) =>
    e instanceof CaseFileCompileError &&
    (e as Error).message ===
      'case-001-denied-claim: shot "s1" opening highlight must be one short line (≤8 words) so the cover can zoom in — pick a shorter phrase.';
  assert.throws(() => opening([line, { ...line, y: 0.82 }], 'two and a half weeks'), refused);
  assert.throws(() => opening([{ ...line, width: 0.7 }], 'two and a half weeks'), refused);
  assert.throws(
    () => opening([line], 'had only been receiving physical therapy for two and a half weeks'),
    refused,
  );
});

test('opening rule skips a card or a document with no highlight as shot 1', () => {
  assert.doesNotThrow(() =>
    compile(baseParams({ scenes: [{ id: 's1', visual: { kind: 'counter', value: 1 } }] })),
  );
  assert.doesNotThrow(() => compile(baseParams()));
});
