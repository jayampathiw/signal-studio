#!/usr/bin/env python3
"""Text-anchored highlight resolver for Policy File case.json files.

Computes exact evidence-highlight boxes from the source PDF's text layer
instead of hand-eyeballed pixel guesses (the failure mode that shipped
misplaced highlights in Video #2: boxes offset half a line, bleeding onto
neighbors). Works because the document PNGs are uniform-scale full-page
renders of the PDFs, so fractional coordinates in PDF page space map 1:1
onto the PNGs — verified per page by an aspect-ratio assertion.

Authoring-time tool only: the render pipeline (assemble-case.mjs → Remotion)
stays pure-Node and consumes the plain x/y/width/height fractions this
script writes back.

case.json additions this script consumes:

  "documents": {
    "<image.png>": { "pdf": "sources/complaint.pdf", "page": 31, "anchor": "$418,141" }
  }

  highlights[]: { "find": { "text": "...", "context": "...", "occurrence": 1,
                            "pad": 4, "part": "union" }, ... }

Highlights without a `find` spec are never touched (hand-authored boxes for
non-text targets like stamps remain supported).

Usage:
  python3 resolve-highlights.py --dir content/policy-file/<slug> [--write] [--no-sheet] [--force]

Default is a dry run: prints resolved boxes and generates the proof sheet
(output/highlight-proof.png) without modifying case.json. --write applies.
Exit code is non-zero if any find target fails to resolve.
"""

import argparse
import json
import math
import struct
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

try:
    import pymupdf
except ImportError:  # older installs expose only the fitz name
    import fitz as pymupdf

PAD_DEFAULT_PX = 4
CROP_MARGIN_X = 120
CROP_MARGIN_Y = 80
TILE_WIDTH = 700


def png_dimensions(path: Path) -> tuple[int, int]:
    with open(path, "rb") as f:
        header = f.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"not a PNG: {path}")
    w, h = struct.unpack(">II", header[16:24])
    return w, h


def norm_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    return "".join(s.split())


def search(page, text: str):
    hits = page.search_for(text)
    if not hits:
        hits = page.search_for(unicodedata.normalize("NFKC", text))
    return hits


def group_by_line(rects):
    """Group rects into lines by vertical overlap (>=50% of the smaller height)."""
    lines = []
    for r in sorted(rects, key=lambda r: (r.y0, r.x0)):
        for line in lines:
            ref = line[0]
            overlap = min(r.y1, ref.y1) - max(r.y0, ref.y0)
            if overlap >= 0.5 * min(r.y1 - r.y0, ref.y1 - ref.y0):
                line.append(r)
                break
        else:
            lines.append([r])
    return lines


def union(rects):
    r = pymupdf.Rect(rects[0])
    for other in rects[1:]:
        r |= other
    return r


def words_covering(page, rect):
    """Words from the text layer that materially overlap `rect`, reading order."""
    out = []
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        ix = min(x1, rect.x1) - max(x0, rect.x0)
        iy = min(y1, rect.y1) - max(y0, rect.y0)
        if ix > 0.3 * (x1 - x0) and iy > 0.3 * (y1 - y0):
            out.append((y0, x0, word))
    return [w for _, _, w in sorted(out)]


def resolve_one(page, spec, label, force=False):
    """Resolve one find spec to a pymupdf.Rect on `page`. Raises on failure."""
    text = spec["text"]
    matches = search(page, text)
    if not matches:
        near = [ln.strip() for ln in page.get_text().splitlines() if text.split()[0].strip("$%.,") in ln]
        raise LookupError(
            f"{label}: no match for {text!r} on this page."
            + (f" Lines containing a fragment: {near[:4]}" if near else "")
        )

    # A multi-word target comes back as several rects for ONE occurrence when
    # the phrase spans text runs on the same line — those union into a single
    # candidate. Distinct occurrences (even on the same line) stay separate.
    if len(matches) > 1 and _same_line(matches) and _adjacent(matches):
        candidates = [union(matches)]
    else:
        candidates = list(matches)

    chosen = None
    context = spec.get("context")
    if context:
        ctx_hits = search(page, context)
        if not ctx_hits:
            raise LookupError(f"{label}: context {context!r} not found on this page")
        best = None
        for ctx in ctx_hits:
            zone = pymupdf.Rect(0, ctx.y0 - 2 * (ctx.y1 - ctx.y0), page.rect.width, ctx.y1 + 2 * (ctx.y1 - ctx.y0))
            for cand in candidates:
                if not zone.contains(pymupdf.Point((cand.x0 + cand.x1) / 2, (cand.y0 + cand.y1) / 2)):
                    continue
                d = math.dist(((cand.x0 + cand.x1) / 2, (cand.y0 + cand.y1) / 2),
                              ((ctx.x0 + ctx.x1) / 2, (ctx.y0 + ctx.y1) / 2))
                if best is None or d < best[0]:
                    best = (d, cand)
        if best is None:
            raise LookupError(f"{label}: no {text!r} match near context {context!r}")
        chosen = best[1]
    elif "occurrence" in spec:
        idx = spec["occurrence"] - 1
        if idx >= len(candidates):
            raise LookupError(f"{label}: occurrence {spec['occurrence']} but only {len(candidates)} match(es)")
        chosen = candidates[idx]
    elif len(candidates) == 1:
        chosen = candidates[0]
    else:
        locs = ", ".join(f"#{i+1} y={c.y0/page.rect.height:.3f}" for i, c in enumerate(candidates))
        raise LookupError(f"{label}: {len(candidates)} matches for {text!r} ({locs}) — add 'context' or 'occurrence'")

    # Substring guard: the covered words must actually be the target (so
    # "2.46" can't land inside "42.46").
    covered = "".join(words_covering(page, chosen))
    tgt = norm_text(text).strip("\"'“”.,;:")
    if tgt not in norm_text(covered):
        msg = f"{label}: box for {text!r} covers text {covered!r} — likely wrong span"
        if not force:
            raise LookupError(msg + " (use --force to accept)")
        print(f"  WARN {msg}")
    else:
        i = norm_text(covered).find(tgt)
        before = norm_text(covered)[i - 1] if i > 0 else ""
        after_i = i + len(tgt)
        after = norm_text(covered)[after_i] if after_i < len(norm_text(covered)) else ""
        if (before.isdigit() and tgt[0].isdigit()) or (after.isdigit() and tgt[-1].isdigit()):
            msg = f"{label}: {text!r} appears embedded in a longer number within {covered!r}"
            if not force:
                raise LookupError(msg + " (use --force to accept)")
            print(f"  WARN {msg}")

    return chosen


def _same_line(rects):
    return len(group_by_line(rects)) == 1


def _adjacent(rects):
    rs = sorted(rects, key=lambda r: r.x0)
    return all(rs[i + 1].x0 - rs[i].x1 < 2 * (rs[i].y1 - rs[i].y0) for i in range(len(rs) - 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--write", action="store_true", help="update case.json in place")
    ap.add_argument("--no-sheet", action="store_true", help="skip the proof sheet")
    ap.add_argument("--force", action="store_true", help="accept substring-guard warnings")
    args = ap.parse_args()

    case_dir = Path(args.dir).resolve()
    case_path = case_dir / "case.json"
    case = json.loads(case_path.read_text())
    documents = case.get("documents")
    if not documents:
        sys.exit("case.json has no 'documents' map — nothing to resolve against")

    pages = {}
    errors = []
    for image_name, meta in documents.items():
        png_path = case_dir / "documents" / image_name
        pdf_path = case_dir / meta["pdf"]
        doc = pymupdf.open(pdf_path)
        page = doc[meta["page"] - 1]
        if page.rotation != 0:
            sys.exit(f"{image_name}: page rotation {page.rotation} unsupported")
        pw, ph = png_dimensions(png_path)
        page_aspect = page.rect.width / page.rect.height
        png_aspect = pw / ph
        if abs(page_aspect - png_aspect) > 0.002:
            sys.exit(f"{image_name}: PDF page aspect {page_aspect:.4f} != PNG aspect {png_aspect:.4f} — wrong page or non-uniform render")
        anchor = meta.get("anchor")
        if anchor and not search(page, anchor):
            sys.exit(f"{image_name}: anchor {anchor!r} not found on {meta['pdf']} page {meta['page']} — wrong page mapping?")
        pages[image_name] = (page, png_path, pw, ph)

    resolved = []  # (label, image_name, highlight dict, fractions)
    for scene in case.get("scenes", []):
        highlights = scene.get("highlights") or ([scene["highlight"]] if scene.get("highlight") else [])
        for i, hl in enumerate(highlights):
            spec = hl.get("find")
            if not spec:
                continue
            label = f"{scene['id']}#{i+1}"
            image_name = scene.get("imagePath")
            if image_name not in pages:
                errors.append(f"{label}: image {image_name!r} missing from documents map")
                continue
            page, png_path, pw, ph = pages[image_name]
            try:
                rect = resolve_one(page, spec, label, force=args.force)
            except LookupError as e:
                errors.append(str(e))
                continue
            pad = spec.get("pad", PAD_DEFAULT_PX)
            fx = max(0.0, rect.x0 / page.rect.width - pad / pw)
            fy = max(0.0, rect.y0 / page.rect.height - pad / ph)
            fw = min(1.0 - fx, (rect.x1 - rect.x0) / page.rect.width + 2 * pad / pw)
            fh = min(1.0 - fy, (rect.y1 - rect.y0) / page.rect.height + 2 * pad / ph)
            frac = {k: round(v, 4) for k, v in zip("x y width height".split(), (fx, fy, fw, fh))}
            hl.update(frac)
            resolved.append((label, image_name, spec["text"], frac))
            print(f"  {label}: {spec['text']!r} -> x={frac['x']} y={frac['y']} w={frac['width']} h={frac['height']}")

    if errors:
        print("\nFAILED to resolve:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)

    if not args.no_sheet and resolved:
        sheet = case_dir / "output" / "highlight-proof.png"
        sheet.parent.mkdir(exist_ok=True)
        build_proof_sheet(resolved, pages, sheet)
        print(f"\nProof sheet: {sheet}")

    if args.write and not errors:
        case_path.write_text(json.dumps(case, indent=2, ensure_ascii=False) + "\n")
        print(f"Wrote {case_path}")
    elif args.write:
        print("NOT writing case.json due to unresolved targets", file=sys.stderr)

    sys.exit(1 if errors else 0)


def build_proof_sheet(resolved, pages, out_path: Path):
    with tempfile.TemporaryDirectory() as td:
        tiles = []
        cmd_montage = ["montage"]
        for n, (label, image_name, text, frac) in enumerate(resolved):
            _, png_path, pw, ph = pages[image_name]
            x1 = int(frac["x"] * pw)
            y1 = int(frac["y"] * ph)
            x2 = int((frac["x"] + frac["width"]) * pw)
            y2 = int((frac["y"] + frac["height"]) * ph)
            cx = max(0, x1 - CROP_MARGIN_X)
            cy = max(0, y1 - CROP_MARGIN_Y)
            cw = min(pw - cx, (x2 - x1) + 2 * CROP_MARGIN_X)
            ch = min(ph - cy, (y2 - y1) + 2 * CROP_MARGIN_Y)
            tile = Path(td) / f"tile-{n:02d}.png"
            subprocess.run([
                "convert", str(png_path),
                "-fill", "rgba(232,185,35,0.45)", "-stroke", "red", "-strokewidth", "3",
                "-draw", f"rectangle {x1},{y1} {x2},{y2}",
                "-crop", f"{cw}x{ch}+{cx}+{cy}", "+repage",
                "-resize", f"{TILE_WIDTH}x",
                str(tile),
            ], check=True, capture_output=True)
            cmd_montage += ["-label", f"{label} · {text}", str(tile)]
            tiles.append(tile)
        cmd_montage += ["-tile", "3x", "-geometry", "+10+10", "-background", "#dddddd", str(out_path)]
        subprocess.run(cmd_montage, check=True, capture_output=True)


if __name__ == "__main__":
    main()
