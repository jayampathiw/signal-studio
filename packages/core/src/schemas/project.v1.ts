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

export const Project = z.object({
  slug: z.string().min(1),
  orgId: z.string().min(1),
  brand: Brand.default({ fonts: [], colours: [], musicBeds: [] }),
  defaults: ProjectDefaults,
  gates: z.array(z.string()).default([]),
  publishTargets: z.array(PublishTarget).default([]),
  promptPack: z.string().optional(),
  providers: ProjectProviders,
});

export type ProjectT = z.infer<typeof Project>;
