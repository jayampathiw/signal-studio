// Channel configuration for the video pipeline.
// Each channel defines: which engine renders it, what source mode fetches scenes,
// brand assets, voice, and which platforms to publish to.
// TODO: migrate channel definitions from reels-pipeline/src/config/channels.js

export const channels = {
  naturePulse: {
    id: 'naturePulse',
    name: 'NaturePulse',
    engine: 'ffmpeg',          // 'ffmpeg' | 'remotion'
    mode: 'stock',             // 'stock' | 'ai-image' | 'seedance'
    topic: 'wildlife nature conservation animals',
    voice: 'af_bella',
    watermarkFile: 'NaturePulse_Logo.png',
    facebook: { enabled: false, pageKey: 'NATURE_PULSE' },
    instagram: { enabled: false, pageKey: 'NATURE_PULSE' },
  },
  natureFrame: {
    id: 'natureFrame',
    name: 'NatureFrame',
    engine: 'ffmpeg',
    mode: 'stock',
    topic: 'wildlife photography stunning nature',
    voice: 'af_bella',
    watermarkFile: 'NatureFrame_Logo.png',
    facebook: { enabled: false, pageKey: 'NATURE_FRAME' },
    instagram: { enabled: false, pageKey: 'NATURE_FRAME' },
  },
  // Example: AI-image channel (Phase 3)
  // viviInItalia: {
  //   id: 'viviInItalia',
  //   engine: 'remotion',
  //   mode: 'ai-image',
  //   voice: 'if_sara',
  //   facebook: { enabled: true, pageKey: 'IT' },
  // },
};
