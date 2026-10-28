import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { DocumentHighlightSpecT, ShotHighlightT } from '@signal-studio/core/schemas';

/**
 * Track P (ADR-003, P.3) — `document` sources: a PDF page rendered to PNG,
 * with highlight boxes found from quoted text in the page's text layer.
 * Port of the legacy `resolve-highlights.py` (pymupdf), on poppler instead:
 * `pdftotext -bbox-layout` gives every word's box in PDF points, and
 * `pdftoppm` renders the page at a uniform scale, so page-space fractions
 * map 1:1 onto the PNG.
 */

const execFileAsync = promisify(execFile);

export const DOCUMENT_DPI = 220;

export type PdfWord = { text: string; x0: number; y0: number; x1: number; y1: number };
export type PdfPage = { width: number; height: number; words: PdfWord[]; lineEnds: Set<number> };
export type Box = { x: number; y: number; width: number; height: number };

export class DocumentError extends Error {}

export async function renderPdfPage(pdfPath: string, page: number, outPrefix: string) {
  try {
    await execFileAsync('pdftoppm', [
      '-f',
      String(page),
      '-l',
      String(page),
      '-r',
      String(DOCUMENT_DPI),
      '-png',
      '-singlefile',
      pdfPath,
      outPrefix,
    ]);
  } catch (err) {
    throw new DocumentError(`could not render page ${page}: ${pdftoolsMessage(err)}`);
  }
  return `${outPrefix}.png`;
}

export async function readPdfPage(pdfPath: string, page: number): Promise<PdfPage> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      'pdftotext',
      ['-f', String(page), '-l', String(page), '-bbox-layout', pdfPath, '-'],
      { maxBuffer: 64 * 1024 * 1024 },
    ));
  } catch (err) {
    throw new DocumentError(`could not read page ${page}: ${pdftoolsMessage(err)}`);
  }
  const parsed = parseBboxLayout(stdout);
  if (!parsed) throw new DocumentError(`page ${page} does not exist in this PDF`);
  return parsed;
}

function pdftoolsMessage(err: unknown): string {
  const e = err as { code?: string; stderr?: string; message: string };
  if (e.code === 'ENOENT') return 'poppler-utils (pdftoppm/pdftotext) is not installed';
  return (e.stderr || e.message).trim().split('\n')[0] ?? e.message;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1));
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Parses `pdftotext -bbox-layout` XHTML for a single page; null when it has no page. */
export function parseBboxLayout(xhtml: string): PdfPage | null {
  const pageMatch = /<page width="([\d.]+)" height="([\d.]+)">/.exec(xhtml);
  if (!pageMatch) return null;
  const words: PdfWord[] = [];
  const lineEnds = new Set<number>();
  const lineRe = /<line\b[^>]*>([\s\S]*?)<\/line>/g;
  const wordRe =
    /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
  for (const line of xhtml.matchAll(lineRe)) {
    const before = words.length;
    for (const w of line[1]!.matchAll(wordRe)) {
      words.push({
        x0: Number(w[1]),
        y0: Number(w[2]),
        x1: Number(w[3]),
        y1: Number(w[4]),
        text: decodeEntities(w[5]!),
      });
    }
    if (words.length > before) lineEnds.add(words.length - 1);
  }
  return { width: Number(pageMatch[1]), height: Number(pageMatch[2]), words, lineEnds };
}

// Case-, whitespace-, ligature- and quote-style-insensitive, like the
// legacy resolver's `norm_text` + pymupdf's case-insensitive search.
function normChar(c: string): string {
  return c
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '');
}

type StreamChar = { c: string; word: number; offset: number };

// Every word's characters back to back (no spaces), so a quote matches
// across text runs and line breaks. A hyphen that ends a line before a
// lowercase word is dropped ("profit-" + "ability" → "profitability").
function buildStream(page: PdfPage): StreamChar[] {
  const out: StreamChar[] = [];
  page.words.forEach((w, wi) => {
    const chars = [...w.text];
    const next = page.words[wi + 1];
    const dropHyphen =
      page.lineEnds.has(wi) &&
      chars.length > 1 &&
      chars[chars.length - 1] === '-' &&
      next !== undefined &&
      /^\p{Ll}/u.test(next.text);
    chars.forEach((ch, ci) => {
      if (dropHyphen && ci === chars.length - 1) return;
      for (const c of normChar(ch)) out.push({ c, word: wi, offset: ci });
    });
  });
  return out;
}

type Occurrence = { lines: Box[] };

const isAlnum = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

function findOccurrences(page: PdfPage, stream: StreamChar[], text: string): Occurrence[] {
  const target = normChar(text);
  if (!target) return [];
  const hay = stream.map((s) => s.c).join('');
  const out: Occurrence[] = [];
  for (let i = hay.indexOf(target); i !== -1; i = hay.indexOf(target, i + 1)) {
    const first = stream[i]!;
    const last = stream[i + target.length - 1]!;
    // Substring guard: "2.46" must not match inside "42.46", "cap" not
    // inside "capital" — a neighbour in the same word that's alphanumeric
    // next to an alphanumeric edge of the quote.
    const prev = stream[i - 1];
    const next = stream[i + target.length];
    if (prev?.word === first.word && isAlnum(prev.c) && isAlnum(target[0])) continue;
    if (next?.word === last.word && isAlnum(next.c) && isAlnum(target.at(-1))) continue;
    out.push({ lines: boxesForSpan(page, first, last) });
  }
  return out;
}

// One box per text line the span covers; partial words are cut
// proportionally to their character count.
function boxesForSpan(page: PdfPage, first: StreamChar, last: StreamChar): Box[] {
  const lines: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  for (let wi = first.word; wi <= last.word; wi++) {
    const w = page.words[wi]!;
    const len = [...w.text].length || 1;
    const from = wi === first.word ? first.offset / len : 0;
    const to = wi === last.word ? (last.offset + 1) / len : 1;
    const x0 = w.x0 + (w.x1 - w.x0) * from;
    const x1 = w.x0 + (w.x1 - w.x0) * to;
    const line = lines.find((l) => {
      const overlap = Math.min(l.y1, w.y1) - Math.max(l.y0, w.y0);
      return overlap >= 0.5 * Math.min(l.y1 - l.y0, w.y1 - w.y0);
    });
    if (line) {
      line.x0 = Math.min(line.x0, x0);
      line.x1 = Math.max(line.x1, x1);
      line.y0 = Math.min(line.y0, w.y0);
      line.y1 = Math.max(line.y1, w.y1);
    } else {
      lines.push({ x0, y0: w.y0, x1, y1: w.y1 });
    }
  }
  return lines.map((l) => ({ x: l.x0, y: l.y0, width: l.x1 - l.x0, height: l.y1 - l.y0 }));
}

const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/**
 * Finds one quote on the page and returns its boxes in PDF points (one per
 * line). Ambiguity is an error, as in the legacy resolver: several matches
 * need `context` (nearby text) or `occurrence` (1-based).
 */
export function findQuote(page: PdfPage, spec: DocumentHighlightSpecT): Box[] {
  const { text, context, occurrence } = typeof spec === 'string' ? { text: spec } : spec;
  if (page.words.length === 0) {
    throw new DocumentError(
      'the page has no text layer (scanned?) — give hand-entered highlight boxes instead',
    );
  }
  const stream = buildStream(page);
  const found = findOccurrences(page, stream, text);
  if (found.length === 0) throw new DocumentError(`quote ${JSON.stringify(text)} not found`);

  if (context) {
    const anchors = findOccurrences(page, stream, context);
    if (anchors.length === 0) {
      throw new DocumentError(`context ${JSON.stringify(context)} not found`);
    }
    let best: { d: number; occ: Occurrence } | undefined;
    for (const anchor of anchors) {
      const a = anchor.lines[0]!;
      const ac = center(a);
      for (const occ of found) {
        const c = center(occ.lines[0]!);
        if (c.y < a.y - 2 * a.height || c.y > a.y + 3 * a.height) continue;
        const d = Math.hypot(c.x - ac.x, c.y - ac.y);
        if (!best || d < best.d) best = { d, occ };
      }
    }
    if (!best) {
      throw new DocumentError(
        `quote ${JSON.stringify(text)} not found near context ${JSON.stringify(context)}`,
      );
    }
    return best.occ.lines;
  }
  if (occurrence !== undefined) {
    const occ = found[occurrence - 1];
    if (!occ) {
      throw new DocumentError(
        `occurrence ${occurrence} of ${JSON.stringify(text)} asked for, but only ${found.length} found`,
      );
    }
    return occ.lines;
  }
  if (found.length > 1) {
    const where = found
      .map((o, i) => `#${i + 1} at ${Math.round((o.lines[0]!.y / page.height) * 100)}% down`)
      .join(', ');
    throw new DocumentError(
      `quote ${JSON.stringify(text)} appears ${found.length} times (${where}) — add "context" or "occurrence"`,
    );
  }
  return found[0]!.lines;
}

/** Page-space boxes → padded 0–1 fractions, with the spec's timing carried over. */
export function toShotHighlights(
  page: PdfPage,
  boxes: Box[],
  spec: DocumentHighlightSpecT,
): ShotHighlightT[] {
  const { fromSec, toSec, fromFraction, toFraction, opacity } =
    typeof spec === 'string' ? ({} as Exclude<DocumentHighlightSpecT, string>) : spec;
  return boxes.map((b) => {
    const padX = b.height * 0.25;
    const padY = b.height * 0.3;
    const x = Math.max(0, (b.x - padX) / page.width);
    const y = Math.max(0, (b.y - padY) / page.height);
    const round = (v: number) => Math.round(v * 10000) / 10000;
    return {
      x: round(x),
      y: round(y),
      width: round(Math.min(1 - x, (b.width + 2 * padX) / page.width)),
      height: round(Math.min(1 - y, (b.height + 2 * padY) / page.height)),
      ...(fromSec !== undefined && { fromSec }),
      ...(toSec !== undefined && { toSec }),
      ...(fromFraction !== undefined && { fromFraction }),
      ...(toFraction !== undefined && { toFraction }),
      ...(opacity !== undefined && { opacity }),
    };
  });
}
