// Channel registry for the video pipeline.
// Each key is the canonical channel_key stored in content_items.channel_key.
// Format: <niche>/<style>/<LANG>

export const CHANNELS = {
  // ── NaturePulse / NatureFrame — English wildlife ──────────────────────────

  'wildlife/factual/EN': {
    niche: 'wildlife',
    style: 'factual',
    language: 'EN',
    contentLanguage: 'English',
    fetchers: [{ type: 'pexels', query: 'wildlife animal nature', perPage: 25, orientation: 'portrait', minDuration: 5 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'factual',
      durationSec: 45,
      clipsPerReel: 6,
      narration: true,
      captions: true,
      voice: 'af_bella',
      voiceSpeed: 1.0,
      music: 'nature_uplifting.mp3',
      musicVolume: 0.10,
      cta: { line1: 'FOLLOW FOR MORE', line2: 'NaturePulse' },
      ctaStyle: { animation: 'fadein', line1FontColor: 'white', line2FontColor: '#90EE90' },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'NATURE_PULSE' },
    },
    watermarkFile: 'NaturePulse_Logo.png',
    pageName: 'NaturePulse',
  },

  'wildlife/listicle/EN': {
    niche: 'wildlife',
    style: 'listicle',
    language: 'EN',
    contentLanguage: 'English',
    fetchers: [{ type: 'pexels', query: 'wildlife animal nature', perPage: 25, orientation: 'portrait', minDuration: 5 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'listicle',
      durationSec: 45,
      clipsPerReel: 6,
      narration: true,
      captions: true,
      voice: 'af_bella',
      voiceSpeed: 1.05,
      music: 'upbeat_pop.mp3',
      musicVolume: 0.12,
      cta: { line1: 'FOLLOW FOR MORE', line2: 'NaturePulse' },
      ctaStyle: { animation: 'fadein', line1FontColor: 'white', line2FontColor: '#90EE90' },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'NATURE_PULSE' },
    },
    watermarkFile: 'NaturePulse_Logo.png',
    pageName: 'NaturePulse',
  },

  'wildlife/cinematic/EN': {
    niche: 'wildlife',
    style: 'cinematic',
    language: 'EN',
    contentLanguage: 'English',
    fetchers: [{ type: 'pexels', query: 'wildlife nature cinematic', perPage: 20, orientation: 'portrait', minDuration: 6 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'cinematic',
      durationSec: 45,
      clipsPerReel: 5,
      narration: true,
      captions: false,
      voice: 'af_bella',
      voiceSpeed: 0.85,
      music: 'cinematic_epic.mp3',
      musicVolume: 0.14,
      cta: { line1: 'FOLLOW NATUREFRAME', line2: 'Daily Wildlife' },
      ctaStyle: { animation: 'fadein', line1FontColor: 'white', line2FontColor: '#E8D5A3' },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'NATURE_FRAME' },
    },
    watermarkFile: 'NatureFrame_Logo.png',
    pageName: 'NatureFrame',
  },

  'wildlife/silent/EN': {
    niche: 'wildlife',
    style: 'silent',
    language: 'EN',
    contentLanguage: 'English',
    fetchers: [{ type: 'pexels', query: 'cute small animals baby wildlife', perPage: 25, orientation: 'portrait', minDuration: 5 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'silent',
      durationSec: 50,
      clipsPerReel: 7,
      narration: false,
      captions: false,
      voice: null,
      voiceSpeed: null,
      music: 'nature_ambient.mp3',
      musicVolume: 0.35,
      cta: { line1: 'FOLLOW NATUREFRAME', line2: 'Daily Wildlife' },
      ctaStyle: { animation: 'fadein', line1FontColor: 'white', line2FontColor: '#E8D5A3' },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'NATURE_FRAME' },
    },
    watermarkFile: 'NatureFrame_Logo.png',
    pageName: 'NatureFrame',
  },

  // ── Wild Capture — Wild Eye (Higgsfield MCP, AI-generated documentary) ────
  //
  // Source and renderer are both 'higgsfield'. This channel is NOT driven by
  // the Pexels ingest path. A Claude agent (interactive or cloud-deployed)
  // calls Higgsfield MCP tools to generate every frame via a storyboard-first
  // workflow. The `formats` map replaces rendererConfig — each key is a
  // house-style formula selectable per content item via the `format` column.

  'wildlife/intimacy/EN': {
    niche: 'wildlife',
    style: 'intimacy',
    language: 'EN',
    contentLanguage: 'English',
    source: 'higgsfield',
    renderer: 'higgsfield',
    imageModel: 'nano_banana_pro',
    videoModel: 'seedance_2_0',
    imageRes: '2k',
    videoRes: '720p',
    aspectRatio: '9:16',
    generateAudio: true,
    formats: {
      '11s': {
        type: 'reel',
        generationStrategy: 'start_frame_chain',
        durationSec: 11,
        scenes: 1,
        register: 'hidden-intimacy',
        slot: 'Fri 23:00 BST',
        description: 'Formula A — single intimate scene. Drives reach.',
      },
      '21s': {
        type: 'reel',
        generationStrategy: 'start_frame_chain',
        durationSec: 21,
        scenes: 3,
        register: 'tension-survival',
        slot: 'Sat 07:30 BST',
        description: 'Formula B — 3-scene tension/survival arc. Drives follows.',
      },
      'portrait': {
        type: 'image',
        generationStrategy: 'image_only',
        durationSec: null,
        scenes: 1,
        register: 'portrait',
        slot: 'Sun/Thu 10:00 BST',
        description: 'Single photorealistic image portrait. Drives engagement/comments.',
      },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'WILD_CAPTURE' },
    },
    watermarkFile: null,
    pageName: 'Wild Capture',
  },

  // ── France Aujourd'hui — French culture ───────────────────────────────────

  'culture/silent/FR': {
    niche: 'culture',
    style: 'silent',
    language: 'FR',
    contentLanguage: 'French',
    fetchers: [{ type: 'pexels', query: 'france paris culture travel', perPage: 20, orientation: 'portrait', minDuration: 5 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'silent',
      durationSec: 45,
      clipsPerReel: 6,
      narration: false,
      captions: false,
      voice: null,
      voiceSpeed: null,
      music: 'cinematic_epic.mp3',
      musicVolume: 0.32,
      cta: { line1: 'SI VOUS AIMEZ LA FRANCE', line2: 'Suivez France Aujourd\'hui' },
      ctaStyle: {
        animation: 'fadein',
        line1FontColor: 'white',
        line1BorderColor: 'black@0.85',
        line2FontColor: 'white',
        line2BorderColor: 'black@0.85',
      },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'FR' },
    },
    watermarkFile: 'FranceAujourdhui_Logo.png',
    pageName: 'France Aujourd\'hui',
  },

  'culture/silent/FR-long': {
    niche: 'culture',
    style: 'silent',
    language: 'FR',
    contentLanguage: 'French',
    fetchers: [{ type: 'pexels', query: 'france landscape architecture culture', perPage: 20, orientation: 'portrait', minDuration: 6 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'silent',
      durationSec: 60,
      clipsPerReel: 8,
      narration: false,
      captions: false,
      voice: null,
      voiceSpeed: null,
      music: 'alternates/paulyudin-inspiring-uplifting-corporate-160692.mp3',
      musicVolume: 0.30,
      cta: { line1: 'SI VOUS AIMEZ LA FRANCE', line2: 'Suivez France Aujourd\'hui' },
      ctaStyle: {
        animation: 'fadein',
        line1FontColor: 'white',
        line1BorderColor: 'black@0.85',
        line2FontColor: 'white',
        line2BorderColor: 'black@0.85',
      },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'FR' },
    },
    watermarkFile: 'FranceAujourdhui_Logo.png',
    pageName: 'France Aujourd\'hui',
  },

  // ── Vivere in Italia — Italian culture ────────────────────────────────────

  'culture/silent/IT': {
    niche: 'culture',
    style: 'silent',
    language: 'IT',
    contentLanguage: 'Italian',
    fetchers: [{ type: 'pexels', query: 'italy rome culture food travel', perPage: 20, orientation: 'portrait', minDuration: 5 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'silent',
      durationSec: 45,
      clipsPerReel: 6,
      narration: false,
      captions: false,
      voice: null,
      voiceSpeed: null,
      music: 'cinematic_epic.mp3',
      musicVolume: 0.32,
      cta: { line1: 'SE AMI L\'ITALIA', line2: 'Segui Vivere in Italia' },
      ctaStyle: {
        animation: 'fadein',
        line1FontColor: 'white',
        line1BorderColor: 'black@0.85',
        line2FontColor: 'white',
        line2BorderColor: 'black@0.85',
      },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'IT' },
    },
    watermarkFile: 'vivere_in_italia_banner_logo.png',
    pageName: 'Vivere in Italia',
  },

  'culture/silent/IT-long': {
    niche: 'culture',
    style: 'silent',
    language: 'IT',
    contentLanguage: 'Italian',
    fetchers: [{ type: 'pexels', query: 'italy venice florence tuscany landscape', perPage: 20, orientation: 'portrait', minDuration: 6 }],
    renderer: 'reel',
    rendererConfig: {
      mode: 'silent',
      durationSec: 60,
      clipsPerReel: 8,
      narration: false,
      captions: false,
      voice: null,
      voiceSpeed: null,
      music: 'alternates/paulyudin-documentary-epic-162452.mp3',
      musicVolume: 0.30,
      cta: { line1: 'SE AMI L\'ITALIA', line2: 'Segui Vivere in Italia' },
      ctaStyle: {
        animation: 'fadein',
        line1FontColor: 'white',
        line1BorderColor: 'black@0.85',
        line2FontColor: 'white',
        line2BorderColor: 'black@0.85',
      },
    },
    platforms: {
      facebook: { enabled: true, envKey: 'IT' },
    },
    watermarkFile: 'vivere_in_italia_banner_logo.png',
    pageName: 'Vivere in Italia',
  },

  // ── The Policy File — investigative case-file documentary ────────────────
  // Real sourced/redacted documents, not Pexels footage or AI-generated frames.
  // No fetchers — content is manually sourced per case, not fetched/generated.
  // Rendered via the CaseFile Remotion composition (packages/render/remotion),
  // not the FFmpeg stills pipeline the football/culture channels use.
  'policy-file/case-file/EN': {
    niche: 'policy-file',
    style: 'case-file',
    language: 'EN',
    contentLanguage: 'English',
    renderer: 'remotion',
    narrationProvider: 'kokoro',
    voice: 'am_michael',
    voiceSpeed: 1.15, // Kokoro default (0.85) read too slow for this channel's pace — round 1 review feedback
    aspectRatio: '16:9',
    platforms: {
      facebook: { enabled: true, envKey: 'POLICY_FILE' },
    },
    watermarkFile: 'PolicyFile_Watermark.svg',
    pageName: 'The Policy File',
  },

  // Short-form data-visualization companion format — same brand/case-file loader
  // (assemble-case.mjs reads `channelKey` from case.json), vertical for Reels/Shorts
  // placement instead of the documentary format's native-Facebook 16:9 long-form.
  'policy-file/data-viz/EN': {
    niche: 'policy-file',
    style: 'data-viz',
    language: 'EN',
    contentLanguage: 'English',
    renderer: 'remotion',
    narrationProvider: 'kokoro',
    voice: 'am_michael',
    voiceSpeed: 1.15,
    aspectRatio: '9:16',
    platforms: {
      facebook: { enabled: true, envKey: 'POLICY_FILE' },
    },
    watermarkFile: 'PolicyFile_Watermark.svg',
    pageName: 'The Policy File',
  },

  // ── South American Football & Diaspora Stories — long-form documentary ─────
  // Parallel long-form pipeline (docs/long-form-pipeline-plan.md). Input is a
  // structured shot list; clips generated 8-wide with shared reference images.
  'football/documentary/EN': {
    niche: 'football',
    style: 'documentary',
    language: 'EN',
    contentLanguage: 'English',
    source: 'higgsfield',
    renderer: 'higgsfield',
    imageModel: 'nano_banana_2',     // reference-image bible (Higgsfield "Nano Banana Pro")
    videoModel: 'seedance_2_0_mini', // unlimited this month; 8-concurrent ceiling
    imageRes: '2k',
    videoRes: '720p',
    aspectRatio: '16:9',
    generateAudio: false,            // VO is per-scene TTS, mixed in assembly
    concurrency: 8,                  // Higgsfield per-account ceiling (API-enforced)
    formats: {
      'long_form': {
        type: 'long_form',
        generationStrategy: 'reference_pool',  // shared reference images + rolling 8-wide pool
        clipDurationSec: 15,                    // max per clip; actual = per-scene VO length
        narration: true,
        narrationProvider: 'kokoro',            // per-scene TTS (@signal-studio/media)
        music: true,
        validation: { look: true, semanticAction: true }, // both gates (Phase 0 decision)
        // targetDurationSec is per-project (from the shot list), not fixed here
        description: 'Long-form documentary. Shot-list driven, parallel generation + validation.',
      },
    },
    platforms: {
      youtube: { enabled: true, envKey: 'FOOTBALL' },
    },
    watermarkFile: 'underdog_archive_standalone_icon.png',
    pageName: 'South American Football Stories',
  },

  // Spanish (Mexico) narration trial for Underdog Archive — see docs/PROJECT-STATUS.md.
  // es-AR (Daniela) was tried first and judged too flat; swapped to es-MX (Claude) for comparison.
  // No platforms wired yet: narration accent is still being validated before this goes live.
  'football/documentary/es-MX': {
    niche: 'football',
    style: 'documentary',
    language: 'es-MX',
    contentLanguage: 'Spanish (Mexico)',
    source: 'higgsfield',
    renderer: 'higgsfield',
    imageModel: 'nano_banana_2',
    videoModel: 'seedance_2_0_mini',
    imageRes: '2k',
    videoRes: '720p',
    aspectRatio: '16:9',
    generateAudio: false,
    concurrency: 8,
    formats: {
      'long_form': {
        type: 'long_form',
        generationStrategy: 'reference_pool',
        clipDurationSec: 15,
        narration: true,
        narrationProvider: 'piper',            // es-MX voice — Kokoro has no LatAm Spanish
        music: true,
        validation: { look: true, semanticAction: true },
        description: 'Long-form documentary, Spanish (Mexico) narration trial.',
      },
    },
    platforms: {},
    watermarkFile: 'underdog_archive_standalone_icon.png',
    pageName: 'South American Football Stories (ES)',
  },
};

export function getChannel(key) {
  const ch = CHANNELS[key];
  if (!ch) throw new Error(`Unknown channel key: "${key}". Valid keys: ${Object.keys(CHANNELS).join(', ')}`);
  return ch;
}

export function listEnabledPlatforms(channel) {
  return Object.entries(channel.platforms)
    .filter(([, cfg]) => cfg.enabled)
    .map(([platform]) => platform);
}
