import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DocumentError,
  findQuote,
  parseBboxLayout,
  readPdfPage,
  renderPdfPage,
  toShotHighlights,
  type PdfPage,
  type PdfWord,
} from './documents.ts';

// Page 31 of the Mamboleo v. Pacific Life complaint (a public court filing
// the legacy resolver was run against) — the legacy boxes for it are the
// reference these tests check against.
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'complaint-p31.pdf',
);

const hasPoppler = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const poppler = { skip: hasPoppler ? false : 'poppler-utils not installed' };

// A synthetic page: one line per entry, words 10pt wide with 2pt gaps.
function page(lines: string[]): PdfPage {
  const words: PdfWord[] = [];
  const lineEnds = new Set<number>();
  lines.forEach((line, li) => {
    let x = 50;
    for (const text of line.split(' ')) {
      words.push({ text, x0: x, y0: 100 + li * 20, x1: x + text.length * 5, y1: 110 + li * 20 });
      x += text.length * 5 + 2;
    }
    lineEnds.add(words.length - 1);
  });
  return { width: 600, height: 800, words, lineEnds };
}

test('parseBboxLayout reads page size, words, line ends and entities', () => {
  const xhtml = `<doc><page width="612.000000" height="792.000000"><flow><block>
    <line xMin="1" yMin="2" xMax="3" yMax="4"><word xMin="1.5" yMin="2" xMax="3" yMax="4">A&amp;B</word><word xMin="4" yMin="2" xMax="5" yMax="4">&#8217;s</word></line>
    <line xMin="1" yMin="6" xMax="3" yMax="8"><word xMin="1" yMin="6" xMax="3" yMax="8">end</word></line>
  </block></flow></page></doc>`;
  const p = parseBboxLayout(xhtml)!;
  assert.equal(p.width, 612);
  assert.deepEqual(
    p.words.map((w) => w.text),
    ['A&B', '’s', 'end'],
  );
  assert.equal(p.words[0]!.x0, 1.5);
  assert.deepEqual([...p.lineEnds], [1, 2]);
  assert.equal(parseBboxLayout('<doc></doc>'), null);
});

test('two columns poppler merged into one block are read column by column', () => {
  // Left column wraps "requesting unnecessary / documentation", right column's
  // line sits between them by height; a full-width line follows.
  const line = (y: number, x: number, text: string) =>
    `<line><word xMin="${x}" yMin="${y}" xMax="${x + 60}" yMax="${y + 10}">${text}</word></line>`;
  const xhtml = `<page width="600.000000" height="800.000000"><flow><block>
    <line><word xMin="50" yMin="100" xMax="110" yMax="110">requesting</word><word xMin="115" yMin="100" xMax="175" yMax="110">unnecessary</word></line>
    ${line(105, 300, 'billing')}
    ${line(112, 50, 'documentation;')}
    ${line(117, 300, 'rules.')}
    <line><word xMin="50" yMin="130" xMax="300" yMax="140">we</word><word xMin="305" yMin="130" xMax="560" yMax="140">reviewed</word></line>
  </block></flow></page>`;
  const p = parseBboxLayout(xhtml)!;
  assert.deepEqual(
    p.words.map((w) => w.text),
    ['requesting', 'unnecessary', 'documentation;', 'billing', 'rules.', 'we', 'reviewed'],
  );
  assert.equal(findQuote(p, 'requesting unnecessary documentation').length, 2);
  assert.equal(findQuote(p, 'billing rules').length, 2);
});

test('a box never reaches the line above when the font box is taller than the line pitch', () => {
  // Word boxes 17pt tall, lines 13pt apart (a large-ascent font).
  const xhtml = `<page width="600.000000" height="800.000000"><flow><block>
    <line><word xMin="50" yMin="100" xMax="110" yMax="117">above</word></line>
    <line><word xMin="50" yMin="113" xMax="110" yMax="130">target</word></line>
  </block></flow></page>`;
  const p = parseBboxLayout(xhtml)!;
  const [box] = findQuote(p, 'target');
  assert.equal(box!.y, 117);
  assert.equal(box!.height, 13);
  const [h] = toShotHighlights(p, [box!], 'target');
  assert.ok(h!.y * 800 >= 116.4, 'pad stays small for a trimmed box');
});

test('a quote is matched across words, case and quote style insensitively', () => {
  const p = page(['the insurer’s “final” decision was DENIED today']);
  const [box] = findQuote(p, 'insurer\'s "final" decision was denied');
  assert.equal(box!.y, 100);
  assert.equal(box!.x, p.words[1]!.x0);
  assert.equal(box!.x + box!.width, p.words[5]!.x1);
});

test('a quote spanning two lines gives one box per line, rejoining a line-end hyphen', () => {
  const p = page(['projected high profit-', 'ability based on premises']);
  const boxes = findQuote(p, 'high profitability based');
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0]!.y, 100);
  assert.equal(boxes[1]!.y, 120);
});

test('a partial word is cut in proportion, and a number is never matched inside a longer one', () => {
  const p = page(['rates of 42.46 and (2.46) here']);
  const [box] = findQuote(p, '2.46');
  const paren = p.words[4]!; // "(2.46)"
  assert.ok(box!.x > paren.x0 && box!.x + box!.width < paren.x1);
  assert.throws(() => findQuote(page(['only 42.46 here']), '2.46'), /not found/);
  assert.throws(() => findQuote(page(['capital gains']), 'cap'), /not found/);
});

test('ambiguous quotes need context or occurrence; errors say what to do', () => {
  const p = page(['rate of 7.1% then', 'filler line here', 'fell from 7.1% to 6.66%']);
  assert.throws(() => findQuote(p, '7.1%'), /appears 2 times .*add "context" or "occurrence"/);
  assert.equal(findQuote(p, { text: '7.1%', occurrence: 2 })[0]!.y, 140);
  assert.equal(findQuote(p, { text: '7.1%', context: 'rate of' })[0]!.y, 100);
  assert.throws(() => findQuote(p, { text: '7.1%', occurrence: 3 }), /only 2 found/);
  assert.throws(() => findQuote(p, { text: '7.1%', context: 'nowhere' }), /context .* not found/);
});

test('a page with no text layer fails clearly', () => {
  assert.throws(
    () => findQuote({ width: 600, height: 800, words: [], lineEnds: new Set() }, 'x'),
    (err: Error) => err instanceof DocumentError && /no text layer \(scanned\?\)/.test(err.message),
  );
});

test('toShotHighlights pads, converts to fractions and keeps the timing', () => {
  const p = page(['hello']);
  const [h] = toShotHighlights(p, findQuote(p, 'hello'), {
    text: 'hello',
    fromFraction: 0.2,
    toFraction: 0.6,
  });
  assert.ok(h!.x < 50 / 600 && h!.y < 100 / 800);
  assert.ok(h!.width > 25 / 600 && h!.height > 10 / 800);
  assert.equal(h!.fromFraction, 0.2);
  assert.equal(h!.toFraction, 0.6);
  assert.equal(h!.fromSec, undefined);
});

test('real court page: boxes land where the legacy resolver put them', poppler, async () => {
  const p = await readPdfPage(FIXTURE, 1);
  assert.equal(p.width, 612);
  // Legacy (pymupdf) results for this page, from the shipped case.json.
  const legacy = [
    { spec: '$418,141', x: 0.2412, yc: 0.1693 },
    { spec: { text: '7.1%', context: 'assumed interest rate of' }, x: 0.5025, yc: 0.2041 },
    { spec: { text: '6.66%', context: 'See Exhibit 7' }, x: 0.1155, yc: 0.3086 },
    { spec: '$364,351', x: 0.4266, yc: 0.2738 },
  ] as const;
  for (const { spec, x, yc } of legacy) {
    const [h] = toShotHighlights(p, findQuote(p, spec), spec);
    assert.ok(Math.abs(h!.x - x) < 0.005, `${JSON.stringify(spec)} x ${h!.x} vs ${x}`);
    assert.ok(Math.abs(h!.y + h!.height / 2 - yc) < 0.005, `${JSON.stringify(spec)} y`);
  }
});

test(
  'real court page renders to a PNG with the page aspect; a missing page fails',
  poppler,
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'documents-test-'));
    try {
      const png = await renderPdfPage(FIXTURE, 1, path.join(dir, 'p'));
      const header = (await readFile(png)).subarray(16, 24);
      const [w, h] = [header.readUInt32BE(0), header.readUInt32BE(4)];
      assert.ok(Math.abs(w / h - 612 / 792) < 0.002, `${w}x${h}`);
      await assert.rejects(readPdfPage(FIXTURE, 2), DocumentError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
