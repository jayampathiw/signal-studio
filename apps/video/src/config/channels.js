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
