# @signal-studio/video

Unified video pipeline — produces 9:16 short-form reels and documentaries using either the FFmpeg engine (stock footage + Kokoro TTS + Whisper) or the Remotion engine (React/TS compositions, AI-image mode).

## Run

```bash
npm run generate-reel            # generate reel for default channel
npm run generate-documentary     # render documentary video
npm run preview-reel             # local preview, no upload
```

## Engine selection

Engine is configured per-channel in `src/config/channels.js`:
- `engine: 'ffmpeg'` → `packages/render/ffmpeg` (Ken Burns, burned subtitles, music mix)
- `engine: 'remotion'` → `packages/render/remotion` (React compositions, Remotion Studio preview)

## Resources

| Folder | Contents |
|---|---|
| `resources/brand/` | NaturePulse/NatureFrame logos, watermarks, FB banners |
| `resources/research/` | Sports/World Cup gap analysis, fan opportunity maps |
| `resources/docs/` | Video style guide, channel playbooks, render reference |
