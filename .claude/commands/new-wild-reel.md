# /new-wild-reel [id]

Start or resume Wild Capture reel generation.

**Usage:**
- `/new-wild-reel` — pick the oldest `status='brief'` row in `wildlife/intimacy/EN`
- `/new-wild-reel 42` — work on content_item id 42 specifically
- `/new-wild-reel "A cavy waking at dawn in her burrow"` — create a new brief from concept and then generate

**What runs:**
Invokes the `wild-eye-reel` skill: credit check → load house-style → expand brief → storyboard → approve → per-scene generate (with continuity chaining) → SEO → persist as `rendered`.

**Stops at:** `status='rendered'`. Does not upload or publish — that is a separate step.

**For a new concept (no existing brief):**
The skill first calls `wild-eye-brief` to create the `content_items` row, then immediately continues into generation. You will be asked to confirm the format (11s/21s/portrait) and slot.

**Interactive approval gates:**
1. Storyboard image — you approve/reject before any video is generated
2. Each scene's start frame — approve before video generation for that scene
3. Final reel summary before `status='rendered'` is written

**On conflicts/blocks:**
If continuity-checker flags a conflict, generation stops and you see the `status_note` description. Resolve it in this session or run `/new-wild-reel [id]` again after the DB is updated.
