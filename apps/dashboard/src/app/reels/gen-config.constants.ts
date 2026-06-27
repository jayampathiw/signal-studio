// Shared generation-config constants — single source of truth for both the
// per-reel Config tab (reel-detail-dialog) and the channel-level defaults editor
// (channel-config-dialog). Keep model IDs in sync with docs/higgsfield-models.md.

// Higgsfield image model IDs — canonical MCP IDs.
export const IMAGE_MODELS: { id: string; label: string }[] = [
  { id: 'nano_banana_pro',     label: 'Nano Banana Pro — Google · 4K quality' },
  { id: 'nano_banana_2',       label: 'Nano Banana 2 — Google · fast, high-quality' },
  { id: 'nano_banana',         label: 'Nano Banana — Google · budget' },
  { id: 'cinematic_studio_2_5',label: 'Cinema Studio 2.5 — Higgsfield · 4K cinematic' },
  { id: 'soul_cinematic',      label: 'Soul Cinema — Higgsfield · cinema stills' },
  { id: 'seedream_v4_5',       label: 'Seedream 4.5 — Bytedance · precise 4K' },
  { id: 'flux_2',              label: 'Flux 2.0 — Black Forest Labs · prompt-accurate' },
  { id: 'kling_omni_image',    label: 'Kling O1 Image — Kling · photorealistic' },
];

// `endImage: false` models cannot do the 21s scenario-3 start+end chain.
export const VIDEO_MODELS: { id: string; label: string; endImage: boolean }[] = [
  { id: 'seedance_2_0',        label: 'Seedance 2.0 — Bytedance · start+end, 4K, 4–15s', endImage: true },
  { id: 'seedance_2_0_mini',   label: 'Seedance 2.0 Mini — Bytedance · fast/budget',     endImage: true },
  { id: 'seedance_1_5',        label: 'Seedance 1.5 Pro — Bytedance · 4/8/12s',          endImage: true },
  { id: 'kling3_0',            label: 'Kling 3.0 — Kling · multi-shot, 3–15s',           endImage: true },
  { id: 'kling3_0_turbo',      label: 'Kling 3.0 Turbo — Kling · fast, start-frame only',endImage: false },
  { id: 'wan2_7',              label: 'Wan 2.7 — Wan · audio sync, start+end, 2–15s',    endImage: true },
  { id: 'cinematic_studio_3_0',label: 'Cinema Studio 3.0 — Higgsfield · premium',        endImage: true },
];

// Per-model clip-duration limits (seconds). `fixed` = only these exact values are
// valid (e.g. Seedance 1.5). Source: docs/higgsfield-models.md.
export interface DurationRange { min: number; max: number; fixed?: number[] }

export const DURATION_RANGE: Record<string, DurationRange> = {
  seedance_2_0:         { min: 4, max: 15 },
  seedance_2_0_mini:    { min: 4, max: 15 },
  seedance_1_5:         { min: 4, max: 12, fixed: [4, 8, 12] },
  kling3_0:             { min: 3, max: 15 },
  kling3_0_turbo:       { min: 3, max: 15 },
  wan2_7:               { min: 2, max: 15 },
  cinematic_studio_3_0: { min: 4, max: 15 },
};
export const DEFAULT_DURATION_RANGE: DurationRange = { min: 2, max: 15 };

export function durationRangeFor(model: string | undefined): DurationRange {
  return (model && DURATION_RANGE[model]) || DEFAULT_DURATION_RANGE;
}

// Clamp a raw duration to the model's range; returns null if not a finite number.
export function clampDuration(raw: any, model: string | undefined): number | null {
  const r = durationRangeFor(model);
  let v = Math.round(Number(raw));
  if (!Number.isFinite(v)) return null;
  return Math.min(r.max, Math.max(r.min, v));
}

export const IMAGE_RES = ['1k', '2k', '4k'];
export const VIDEO_RES = ['480p', '720p', '1080p', '4k'];
export const ASPECT_RATIOS = ['9:16', '16:9', '1:1'];

// Code-level channel fallback — mirrors apps/video/src/config/channels.js
// wildlife/intimacy/EN. This is the bottom of the precedence chain:
//   reel gen_config → channel_configs (DB) → these defaults.
export const CHANNEL_DEFAULTS = {
  imageModel: 'nano_banana_pro',
  videoModel: 'seedance_2_0',
  imageRes:   '2k',
  videoRes:   '720p',
  aspectRatio:'9:16',
};
