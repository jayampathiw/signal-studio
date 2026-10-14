import { z } from 'zod';

/**
 * The engine's project schema — per-brand/channel configuration a manifest
 * resolves against (see resolve.ts's precedence: manifest > project > env).
 * Field list per refactor-plan.md §10 P1.1. `providers{...}` names which
 * provider id to use per role; concrete provider *implementations* are
 * packages/providers' concern (P1.6/P3.4), this just records the choice.
 */

export const Brand = z.object({
  fonts: z.array(z.string()).default([]),
  colours: z.array(z.string()).default([]),
  watermark: z.string().optional(),
  musicBeds: z.array(z.string()).default([]),
});

export const ProjectDefaults = z.object({
  template: z.string(),
  voice: z.string(),
  speed: z.number().min(0.5).max(2).default(1.0),
  outputs: z.array(z.string()).min(1),
});

export const PublishTarget = z.object({
  platform: z.string(),
  // Credential lookup key, not the credential itself (e.g. 'FB_PAGE_ID_FR')
  // — actual secrets stay in env/secret stores per CLAUDE.md's "four
  // separate secret stores" gotcha, never inlined into project config.
  credentialRef: z.string(),
});

export const ProjectProviders = z.object({
  tts: z.string(),
  captions: z.string(),
  image: z.string(),
  stock: z.string().optional(),
  storage: z.string(),
  publish: z.string(),
});

// P3.6 addition — the plan's own "qa stage" bullet names checks ("vs
// project target") without pinning field names, so this is that file's own
// decision. `targetLufs`/`maxTruePeakDb` default to -14/-1.0, the exact
// values `packages/render/ffmpeg/src/audio-mix.ts`'s own `loudnorm` calls
// already target — but see `qa.ts`'s own header for why LUFS is checked as
// a wide-tolerance warning, not a tight target: integrated loudness swings
// legitimately with how much silence a video has between narration beats,
// so a fixed close target would false-positive on quieter, slower-paced
// content. `visionCheck` opts into the optional `llm-anthropic` frame
// spot-check — off by default since it costs a real API call per job.
export const ProjectQa = z.object({
  targetLufs: z.number().default(-14),
  maxTruePeakDb: z.number().default(-1.0),
  visionCheck: z.boolean().default(false),
});

export const Project = z.object({
  slug: z.string().min(1),
  orgId: z.string().min(1),
  brand: Brand.default({ fonts: [], colours: [], musicBeds: [] }),
  defaults: ProjectDefaults,
  gates: z.array(z.string()).default([]),
  publishTargets: z.array(PublishTarget).default([]),
  promptPack: z.string().optional(),
  providers: ProjectProviders,
  qa: ProjectQa.default({ targetLufs: -14, maxTruePeakDb: -1.0, visionCheck: false }),
});

export type ProjectT = z.infer<typeof Project>;
