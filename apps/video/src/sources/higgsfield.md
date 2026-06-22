# Higgsfield MCP — Agent-facing Source Documentation

> This file is loaded by the `wild-eye-reel` skill and cloud agent as context on how to correctly call Higgsfield MCP tools. Read this before calling any `mcp__claude_ai_higgsfield__*` tool.

## Connection

Higgsfield is available as an **OAuth MCP** on `claude.ai` / `claude.ai/code` — no local config needed. In a Claude Code session, toggle it on via the `+` menu (or it auto-loads if configured). The MCP URL for adding as a custom connector: `https://mcp.higgsfield.ai/mcp`.

Root `.mcp.json` note: Higgsfield is not listed there because it's claude.ai-hosted. If running a cloud agent on an external platform, you'll need to add the HTTP MCP server: `{ "type": "http", "url": "https://mcp.higgsfield.ai/mcp" }`.

## Core tools used by the Wild Eye pipeline

| Tool | Use case | Credit cost |
|---|---|---|
| `generate_image` | Start-frame images, storyboard panel, portrait final image | Low–medium |
| `generate_video` | Per-scene video clip (Seedance 2.0 / Kling) | High |
| `job_status` | Poll until `done` / `failed` / `blocked` | Free |
| `reveal_generation` | Unblock a rights-verification hold | Free |
| `models_explore` | Get model recommendation for a use case | Free |
| `show_plans_and_credits` | Check balance before run | Free |
| `balance` | Quick balance check | Free |
| `virality_predictor` | Hook strength / engagement score | Medium |
| `transactions` | Review credit spend history | Free |

## Model selection for Wild Capture content

Always call `models_explore(action:'recommend')` before generation if unsure. Guidance for Wild Capture's documentary-style wildlife:

- **Storyboard images:** GPT Image 2 (from Higgsfield) or Nano Banana Pro — photorealistic, flexible with multi-panel layouts
- **Start-frame images:** Nano Banana Pro or Cinema Studio 2.5 (for cinematic grade); avoid models that drift toward stylised/anime
- **Video generation:** **Seedance 2.0** is the primary model (best motion quality, multi-shot support, excellent for wildlife); Kling 3.0 as fallback
- **Portraits:** GPT Image 2 or Nano Banana Pro — extreme close-up realism

## Critical: multi-shot vs single-shot prompting

SeaDance 2.0 performs significantly **better with descriptive multi-shot prompts** than with single shots based on individual start frames alone. When generating a 21-second reel's 3 scenes:
- Write prompts that describe continuous motion and camera movement, not just "a cavy sitting"
- Specify camera moves explicitly: "slow push-in", "near-imperceptible pan left", "static hold"
- Include audio cues in the video prompt — Seedance uses them for temporal rhythm

## Approval modes

### Interactive sessions
Set `generate_image` and `generate_video` to **"ask"** in Higgsfield MCP permissions. This prevents accidental credit burns when Claude is given broad permissions. Review each generation before approving.

### Cloud agent sessions
- `generate_image`: auto-approve (storyboard images are cheap; continuity-checker gates quality)
- `generate_video`: auto-approve ONLY if `higgsfield-credit-guard` passes and continuity-checker returned `approvedToProceed: true`
- Default resolutions: 2K images, 720p video

## Rights / blocked generations

When `job_status` returns `blocked` or a rights-verification warning:
1. Call `mcp__claude_ai_higgsfield__reveal_generation` with the job ID
2. Wait ~5 seconds
3. Re-poll `job_status`
4. If still blocked after 2 retries: mark `scene_status = 'blocked'`, set `status_note`, STOP.

In interactive mode: the blocked generation may also appear under "rights verification required" at `higgsfield.ai` → video generation tab. The user can confirm rights there and the result will then show in Claude.

## Credit management

**There is no live credit meter during generation.** Once you start generating, you don't see a "credits remaining" counter update in real-time. This is why `higgsfield-credit-guard` runs before every session and why `generate_video` is always approval-gated.

Approximate cost order (low to high): `job_status` = free < `generate_image` 2K < `generate_image` 4K < `generate_video` 720p < `generate_video` 1080p < `generate_video` 4K

Always use 2K for storyboard images. Use 720p for video in cloud/unattended mode.

## Style consistency across scenes

The most common quality failure (from testing) is **style drift between scenes** when Claude picks different models per scene. Fix:
1. Pick one model at the start of a reel run (from `models_explore`)
2. Use that model for ALL image generations in the same reel
3. Feed each scene's `final_frame_url` as the reference image for the next scene's start frame — this is the continuity mechanism

## Audio

For Wild Capture: `audio: true`, `voiceover: false`, `music: false`. The house rule is **natural sound only**. Seedance respects the audio cues in the video prompt — write them specifically: "close-mic'd breathing, soil settling, distant grass rustle" not "ambient sounds".
