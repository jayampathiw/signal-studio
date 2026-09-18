---
name: wild-eye-brief
description: Create a Wild Capture (Wild Eye) brief by calling create-brief.mjs. Thin interactive wrapper — takes user concept, passes it to the shared script which runs AI validation + INSERT. Never runs SQL directly.
---

# Wild Eye Brief — Interactive Entry Point

Interactive wrapper around `apps/video/scripts/create-brief.mjs`. Takes the user's concept, passes it to the shared script, and reports back the result. All AI validation (species check, title generation, format recommendation, tension check) and the DB INSERT happen inside the script.

**Do not run SQL directly. Do not duplicate validation logic. Always call the script.**

## When to invoke

When the user wants to create a new Wild Capture brief from a concept idea.

## Inputs from user

- `concept`: one or more sentences describing the reel idea
- `format` (optional): `11s` | `21s` | `portrait` — if omitted, script recommends based on concept
- `slot` (optional): override posting slot — if omitted, derived from format

## Steps

### 1. Take the concept

Accept the user's raw concept text. Do not pre-validate or pre-filter — pass it directly to the script. The script handles species check, format recommendation, and all other validation.

If the user provided a format, include `--format`. If not, omit it and let the script recommend.

### 2. Call the shared script

```bash
node apps/video/scripts/create-brief.mjs \
  --channel "wildlife/intimacy/EN" \
  --concept "<user's concept verbatim>" \
  [--format <format>] \
  [--slot "<slot>"]
```

The script will:

- Call Claude API: species check → format recommendation → title generation → tension check (21s)
- Validate slot / day-of-week
- Near-duplicate check (content_items + reels_log)
- INSERT into content_items
- Return JSON: `{ id, title, format, slot }`

### 3. Handle script output

**On success:** report back to the user:

```
✅ Brief created: C-{id}
Format: {format}  |  Slot: {slot}
Title: "{title}"
Ready for generation. Run /new-wild-reel {id} to start.
```

**On species rejection:** the script exits with a non-zero code and a message. Surface the message and the suggested cavy reframe to the user.

**On near-duplicate warning:** the script pauses and asks for confirmation. Relay the warning to the user and ask if they want to proceed.

**On narrative tension failure (21s):** the script asks a clarifying question. Relay it to the user, collect their answer, and re-run with the enriched concept.

**On slot rejection (Tue/Wed/Thu for Reels):** the script suggests a valid slot. Relay and confirm with the user.

## What this skill does NOT do

- Run SQL INSERT directly
- Generate titles without the script
- Validate species independently
- Check duplicates independently

All of that is in `apps/video/scripts/create-brief.mjs` — the single source of truth.

## Channel: Wild Capture

`channel_key = 'wildlife/intimacy/EN'` is hardcoded for this skill.
For a different channel, use that channel's brief skill.
