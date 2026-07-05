# How We Made "Silenced" — Step-by-Step

> Paraguay's penalty shootout win over Germany · 2026 World Cup Round of 32  
> Final video: **9 minutes 3 seconds · 51 scenes · 111 AI-generated assets**  
> Final URL: `https://pub-04c93fd5cf6f45528d97b1bbfe60706a.r2.dev/longform/29/final.mp4`

---

## Pipeline Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INPUTS (human-written once)                        │
│                                                                             │
│   silenced-shotlist.md          channels.js                                 │
│   (51 scenes: visual prompt,    (channel config: model, resolution,         │
│    VO text, duration, type)      concurrency, platform settings)            │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1 — plan.mjs                                                          │
│  Parse shotlist → write rows to Supabase                                    │
│  • 1 row in content_items  (the project)                                    │
│  • 12 rows in content_references  (reference image bible)                   │
│  • 51 rows in content_clips  (one per scene)                                │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 2 — classify-scenes.mjs                                               │
│  Claude reads each scene's prompt → decides type:                           │
│  • still (37) — one image + slow zoom                                       │
│  • clip  (11) — AI-generated moving video                                   │
│  • text_card (3) — white text on black screen                               │
│  Writes clip_type back to content_clips rows in Supabase                    │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
             ┌─────────────┴──────────────┐
             ▼                            ▼
┌────────────────────────┐   ┌────────────────────────────────────────────────┐
│  STEP 3                │   │  STEP 3b (parallel)                            │
│  generate-references   │   │  prompt-sheet.mjs → import-stills.mjs          │
│  .mjs                  │   │                                                │
│  Generate 12 reference │   │  For scenes needing real photos (S14,S30,S51): │
│  images via Higgsfield │   │  • prompt-sheet writes a markdown brief         │
│  (nano_banana_2 model) │   │  • You download photos from Google manually    │
│  Upload to R2          │   │  • import-stills.mjs uploads them to R2        │
│  Register media IDs    │   │    and marks those scenes as generated          │
│  in content_references │   └────────────────────────────────────────────────┘
└────────────┬───────────┘
             │  (barrier: all 12 refs must be 'passed' before next step)
             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 4 — generate-stills.mjs                                               │
│  For each 'still' scene (37 total):                                         │
│  • Submits prompt + reference image(s) to Higgsfield (nano_banana_2)        │
│  • soul.js handles the Higgsfield image API call                            │
│  • pool.js keeps 8 jobs running in parallel (Higgsfield's ceiling)          │
│  • On completion: uploads image to R2 → writes clip_url to content_clips    │
│  Output: 37 PNG/JPEG images at longform/29/stills/                          │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
             ┌─────────────┴──────────────┐
             ▼                            ▼
┌────────────────────────┐   ┌────────────────────────────────────────────────┐
│  STEP 5                │   │  STEP 6                                        │
│  generate-tts.mjs      │   │  generate-clips.mjs                            │
│  (runs in parallel     │   │  (runs in parallel with TTS)                   │
│   with clip gen)       │   │                                                │
│  For each scene with   │   │  For each 'clip' scene (11 total):             │
│  VO text (48 scenes):  │   │  • Submits prompt + ref images to Higgsfield   │
│  • Kokoro TTS reads    │   │    (seedance_2_0_mini model, 720p video)        │
│    the narrator lines  │   │  • higgsfield.js wraps the CLI submit + poll   │
│  • Saves WAV file      │   │  • pool.js keeps 8 jobs running in parallel     │
│  • Uploads to R2       │   │  • On done: writes clip_url to content_clips   │
│  • Writes vo_url to    │   │  Output: 11 MP4 clips at Higgsfield CDN        │
│    content_clips       │   └────────────────────────────────────────────────┘
│  Output: 51 WAV files  │
│  at longform/29/tts/   │
└────────────┬───────────┘
             │
             └─────────────┐
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 7 — assemble-longform.mjs  (NEW — built for this project)             │
│  Downloads all assets, builds per-scene MP4s, stitches final video          │
│                                                                             │
│  For each still (37):    image + WAV → FFmpeg Ken Burns zoom → scene.mp4   │
│  For each clip (11):     video + WAV → FFmpeg scale + VO mix → scene.mp4   │
│  For each text_card (3): black frame + drawtext + silence → scene.mp4      │
│                                                                             │
│  Concat all 51 → final 9-min MP4 → upload to R2                            │
│  Update content_items: status='rendered', rendered_video_url=...            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Reference Map

### Scripts (you run these)

| Script | What it does | Command |
|---|---|---|
| `apps/video/scripts/longform/plan.mjs` | Parses the shot list, creates all DB rows | `node plan.mjs --file shotlist.md --channel football/documentary/EN` |
| `apps/video/scripts/longform/classify-scenes.mjs` | Claude classifies each scene as still / clip / text_card | `node classify-scenes.mjs --project 29 --file shotlist.md` |
| `apps/video/scripts/longform/generate-references.mjs` | Generates the 12 reference images (visual bible) | `node generate-references.mjs --project 29` |
| `apps/video/scripts/longform/prompt-sheet.mjs` | Writes a brief for scenes needing Google photos | `node prompt-sheet.mjs --project 29` |
| `apps/video/scripts/longform/import-stills.mjs` | Uploads manually-downloaded Google photos to R2 | `node import-stills.mjs --project 29 --dir ./google-stills/` |
| `apps/video/scripts/longform/generate-stills.mjs` | Generates all 37 still images via Higgsfield | `node generate-stills.mjs --project 29` |
| `apps/video/scripts/longform/generate-tts.mjs` | Generates all narrator WAV files via Kokoro TTS | `node generate-tts.mjs --project 29` |
| `apps/video/scripts/longform/generate-clips.mjs` | Generates all 11 motion video clips via Higgsfield | `node generate-clips.mjs --project 29` |
| `apps/video/scripts/longform/assemble-longform.mjs` | Assembles everything into the final MP4 | `node assemble-longform.mjs --project 29` |

### Supporting Source Files (the engine — not run directly)

| File | Role |
|---|---|
| `apps/video/src/config/channels.js` | Channel config — sets the AI models, resolution, concurrency, and platform targets for `football/documentary/EN` |
| `apps/video/src/longform/pool.js` | Rolling concurrency pool — keeps exactly 8 Higgsfield jobs running at once, starts the next one the moment any finishes |
| `apps/video/src/longform/higgsfield.js` | Higgsfield CLI wrapper — submits a job, polls for completion, handles the 8-job rate limit as a back-off not a failure |
| `apps/video/src/longform/soul.js` | Still image generation — calls Higgsfield's image API with the right model and reference images |
| `apps/video/src/longform/parse-shotlist.js` | Parses the markdown shot list into structured scene objects |
| `apps/video/src/longform/plan-references.js` | Builds the reference image bible from the shot list |

### Packages (shared across the whole platform)

| Package | Import | What it provides |
|---|---|---|
| `packages/media/tts.js` | `@signal-studio/media/tts` | Kokoro TTS — converts text to WAV audio |
| `packages/media/storage.js` | `@signal-studio/media/storage` | `uploadToR2()` — uploads files to Cloudflare R2 |
| `packages/database/supabase.js` | `@signal-studio/database` | Supabase client — reads/writes all DB tables |
| `packages/render/ffmpeg/kenburns.js` | `@signal-studio/render-ffmpeg` | Ken Burns zoom animation for still images |
| `packages/render/ffmpeg/concat.js` | `@signal-studio/render-ffmpeg` | FFmpeg concat — joins multiple MP4s into one |

### Database Tables (Supabase — single source of truth)

| Table | Holds |
|---|---|
| `content_items` | One row per project — title, channel, status, final video URL |
| `content_clips` | One row per scene — prompt, VO text, duration, clip URL, VO URL, status |
| `content_references` | One row per reference image — key name, Higgsfield media ID, status |

### Database Migrations (schema history)

| File | What it created |
|---|---|
| `supabase/migrations/20260701_longform_schema.sql` | `content_clips` + `content_references` tables — the longform pipeline tables |
| `supabase/migrations/20260702_hybrid_stills.sql` | Added `image_source` column to support Google/Higgsfield/reference routing |

### Working Files (temp — created during production)

| File / Folder | Created by | Contains |
|---|---|---|
| `temp/longform/29/silenced-shotlist.md` | You (manually written) | The 51-scene shot list — the source of everything |
| `temp/longform/29/silenced.bible.json` | Claude | Story narrative and character notes |
| `temp/longform/29/29-promptsheet.md` | `prompt-sheet.mjs` | Brief for Google photo scenes (S14, S30, S51) |
| `temp/longform/29/google-stills/` | You (manually downloaded) | Real match photos before R2 upload |
| `temp/longform/29/refs/` | `generate-references.mjs` | Local copies of reference images |

---

## How the Database Tracks Progress

Every scene row in `content_clips` has a `status` field. The scripts are all resumable — they only process rows that aren't done yet, so a crash never loses completed work.

```
pending  →  generating  →  generated  →  (assembly reads these)
                ↓
             failed  →  retry  →  generating  →  generated
             blocked     (reset needed if auth/credits failed)
```

The `content_items` row tracks the overall project:

```
planning  →  rendering  →  rendered  →  publishing  →  posted
```

---

## For GitHub Automation (future)

When we automate this with GitHub Actions + Node connection pooling, each step maps to one workflow job:

```
Workflow: longform-generate.yml
├── Job 1: plan          → runs plan.mjs + classify-scenes.mjs
├── Job 2: references    → runs generate-references.mjs  (depends on job 1)
├── Job 3: stills        → runs generate-stills.mjs      (depends on job 2)
├── Job 3b: tts          → runs generate-tts.mjs         (runs parallel with job 3)
├── Job 4: clips         → runs generate-clips.mjs       (depends on job 2)
└── Job 5: assemble      → runs assemble-longform.mjs    (depends on 3, 3b, 4)
```

**Connection pooling note:** The Supabase client in `packages/database/supabase.js` uses a
single connection per Node process. When running jobs in parallel on GitHub Actions
(multiple workers hitting the same DB), use `SUPABASE_SERVICE_ROLE_KEY` with the
`pgbouncer=true` connection string from the Supabase dashboard — this enables
connection pooling through PgBouncer and avoids hitting Postgres's connection limit.

The secret stores you will need to configure on the `reel-pipeline` GitHub repo:

| Secret | Used by |
|---|---|
| `SIGNAL_STUDIO_DEPLOY_KEY` | Checkout this private repo |
| `ANTHROPIC_API_KEY` | Claude (classify step) |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | All DB reads/writes |
| `HIGGSFIELD_AUTH_TOKEN` | Image and video generation |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_RENDERED`, `R2_PUBLIC_BASE_URL` | Uploading assets |
