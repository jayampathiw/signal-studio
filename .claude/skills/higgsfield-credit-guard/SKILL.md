---
name: higgsfield-credit-guard
description: Check Higgsfield credit balance before any generation run. Enforce per-run ceiling, quality defaults, and abort-if-low. Must be called at the start of every automated or interactive generation session.
---

# Higgsfield Credit Guard Skill

The Higgsfield MCP provides **no live credit meter during generation**. This is the #1 cost risk from the transcripts: once you set "always allow", credits burn silently. This skill enforces a hard ceiling and safe defaults at session start.

## When to invoke
At the start of any generation session (cloud agent OR interactive) — before any `higgsfield:generate` or `mcp__claude_ai_higgsfield__generate_*` call. Re-invoke before each scene in cloud mode.

## Default quality settings (apply unless overridden)
| Setting | Cloud agent | Interactive |
|---|---|---|
| Image resolution | 2K | 2K |
| Video resolution | 720p | 1080p |
| Storyboard image | 2K | 2K |
| Video model | Seedance 2.0 | Seedance 2.0 |
| Approval mode | auto (with continuity gate) | ask before each gen |

## Steps

### 1. Check balance
**Cloud (CLI):** run `higgsfield account balance` and parse the output.
**Interactive (MCP):** call `mcp__claude_ai_higgsfield__balance` or `mcp__claude_ai_higgsfield__show_plans_and_credits`.

Parse: `{ currentCredits, plan, resetDate }`.

### 2. Apply thresholds
| Balance | Action |
|---|---|
| < 50 credits | STOP immediately. Print: "⚠️ Higgsfield balance critically low (N credits). Generation aborted. Top up at higgsfield.ai before running." Set content_item status back to `storyboard` (not `generating`). |
| 50–200 credits | Warn: "Low balance (N credits). Forcing 720p video + 2K images. Storyboard only, then pause for approval." Override resolution to 720p for all videos. |
| > 200 credits | Proceed with configured defaults. |

### 3. Set session defaults
Announce the quality settings that will be used for this session. Example:
```
Credit guard: 847 credits available. Session defaults: 720p video, 2K images, Seedance 2.0. Approval required before each video generation.
```

### 4. Return config object
```js
{ ok: true, balance: N, videoResolution: '720p', imageResolution: '2K', model: 'seedance-2.0', requireApproval: true/false }
```
Pass this config to the orchestrator skill (e.g. `wild-eye-reel`).

## Cloud agent specific rules
- Re-check balance after each scene (not just at session start) — abort mid-run if balance drops below 50
- Log credit spend estimate at end of run: "Generated N scenes, estimated M credits used."
- Never use 4K images or 4K video in cloud/unattended mode (excessive cost risk)

## Interactive specific rules
- Report balance at start but don't block if balance > 50
- Recommend setting `generate_image` and `generate_video` Higgsfield permissions to "ask" not "always allow"
- Optionally call `mcp__claude_ai_higgsfield__transactions` to show recent spend
