# ADR-003: Assets by reference — the worker fetches, callers never upload

**Status: accepted 2026-10-28.** First release (v0.1.2) covers The Policy File end to end
(`url` + `document` sources). `stock`, `generate`, `inbox` and "Trigger only" mode are planned for
later releases. Tracked as Track P in `docs/refactor/refactor-plan.md` §10.

## Context

The original plan already put asset resolution on the server:

- §2.2: the `assets` stage is _"probe + normalise user clips/stills; **or image/stock provider**"_,
  followed by an `assets_review` gate.
- §2.3: input modes include "Script only" (`visual.mode: "generate"` or `"stock"`) and
  "Trigger only" (topic + project `prompt_pack`/`topic_source`).
- §2.5 / §6.5: the claude.ai Project is a caller that sends only the job, through `/mcp` or
  `POST /jobs`.

What actually got built was narrower, because AssembleX (the first live page) only needed
uploaded clips:

- `packages/core/src/stages/assets.ts` only probes and normalises files already uploaded to R2.
  Anything missing fails with `MissingAssetsError`.
- `apps/worker/src/deps.ts` wires no stock or image provider. `stock-pexels` and `image-fal`
  (P3.4) exist and were verified against the real APIs, but nothing calls them.
- The only way to get a file in is `presign_upload` + an HTTP `PUT`. That works from Claude Code
  on a local machine, but not from a claude.ai Project: its sandbox can't reliably reach R2, and
  the files (court PDFs, filings) usually live on public sites anyway.
- `case-file` highlights are hand-entered `x/y/width/height` boxes (`ShotHighlight`). The legacy
  `resolve-highlights.py`, which placed boxes from a quote using the PDF's text layer, was never
  ported.

The owner wants to trigger reels for every page (Policy File, AssembleX, France Aujourd'hui,
Underdog…) from their claude.ai Projects, so an upload-only flow doesn't scale.

## Decision

**A job names where each asset comes from. The worker fetches it.** Callers send JSON only.

Each shot (or `case-file` scene) can carry a source reference instead of an uploaded filename:

| Source     | Example                                                                                   | Resolved by                                                     | For                          | Release    |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------- | ---------- |
| `upload`   | `"image": "S01-A"` — already in R2 (today's behaviour, unchanged)                         | existing download                                               | own footage, fallback        | today      |
| `url`      | `{ "url": "https://…/photo.jpg" }` — any public image, video or PDF                       | HTTP download → R2                                              | every page                   | **v0.1.2** |
| `document` | `{ "url": "https://…/ruling.pdf", "page": 3, "highlight": ["exact sentence from page"] }` | download PDF → render page (poppler) → find quote in text → box | **Policy File**              | **v0.1.2** |
| `stock`    | `{ "provider": "pexels", "query": "oyster underwater", "orientation": "portrait" }`       | `stock-pexels` provider, attribution recorded                   | **AssembleX**                | v0.1.3     |
| `generate` | `{ "prompt": "…" }`                                                                       | `image-fal` provider                                            | **Underdog**, stock fallback | v0.1.4     |
| `inbox`    | `{ "inbox": "my-clip.mp4" }` — dropped in the `reels-inbox` R2 bucket                     | R2 copy                                                         | own footage from phone/PC    | v0.1.4     |

Rules:

1. **Resolution happens in the `assets` stage**, before audio/compile/render. Every resolved file
   is written to R2 under the job, so retries and re-renders never fetch again (content-hash keyed,
   like every other stage).
2. **`assets_review` gate** shows what was fetched: each image/clip, and for `document` the page
   with its highlight boxes drawn on. The owner approves (dashboard or `approve_gate` from claude.ai)
   before anything renders. Projects can drop this gate once trusted, like AssembleX's.
3. **A failed fetch fails the job clearly**, naming the shot and the URL: never a silent blank
   frame. Same for a quote that isn't found on the page.
4. **Uploads keep working.** `upload` is just one source among several; all existing manifests
   (including the 47 migrated Policy File ones) stay valid.
5. **`queue_job` MCP tool** is added so a claude.ai Project can start the render itself
   (`create_job` → `queue_job`). The `POST /jobs/{id}/queue` route already exists.
6. **Hand-entered `highlight` boxes stay supported** — they win over a `document` quote when both
   are given, as the manual fallback (e.g. scanned PDFs).

### The Policy File flow after v0.1.2

1. In the claude.ai Project, the owner asks for a reel on a document.
2. Claude writes the script, picks pages and exact quotes, writes the caption, and calls
   `create_job` then `queue_job`.
3. The worker downloads the PDF, renders the pages, places the highlight boxes, renders the
   `case-file` video (with watermark), and stops at review.
4. The owner approves in the dashboard → it publishes to the Policy File Facebook page.

### Ruled out

- **Uploading from the claude.ai sandbox** (`presign_upload` + `PUT`). Network access from the
  sandbox is limited and not something to build every page on. `presign_upload` stays for Claude
  Code and the dashboard.
- **A separate "fetcher" service.** The worker already has network, ffmpeg and R2; a new service
  adds deploy surface for no gain.
- **claude.ai attaching files as base64 in the job.** Bloats the `jobs` row and MCP payloads, and
  PDFs/videos quickly exceed sensible request sizes.

## Risks

- **Sites that block server downloads** (PACER, Cloudflare-protected pages). Fallback: upload via
  the dashboard, or the `inbox` source later.
- **Scanned PDFs have no text layer**, so quotes can't be found. The job fails with a clear error;
  fallback is hand-entered boxes. OCR is a possible later addition.
- **Stock/generated picks can be off-topic** — exactly what `assets_review` is for.
- **Licensing**: `url` assets are the caller's responsibility (same as uploads today). `stock`
  records attribution automatically.

## Consequences

- The plan's §2.2/§2.3 design is now actually implemented rather than replaced. §2.2 and §2.3
  point to this ADR.
- The manifest schema gains an optional source reference per shot/scene; `manifest.v1` stays v1
  (additive change).
- The worker needs `poppler-utils` in its image for `document` (PDF → PNG and text with
  coordinates).
