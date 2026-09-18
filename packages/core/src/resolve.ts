import type { ManifestT } from './schemas/manifest.v1.ts';
import type { ProjectT } from './schemas/project.v1.ts';

/**
 * Resolves a manifest against its project (and env) into a frozen
 * ResolvedJob — the single object every downstream stage reads from,
 * instead of each stage separately re-deriving precedence. Precedence:
 * manifest > project > env defaults (P1.4).
 */

export type ResolvedProviders = {
  tts: string;
  captions: string;
  image: string;
  stock?: string;
  storage: string;
  publish: string;
};

export type ResolvedJob = {
  manifest: ManifestT;
  projectSlug: string;
  orgId: string;
  template: string;
  voice: string;
  speed: number;
  outputs: string[];
  gates: string[];
  providers: ResolvedProviders;
};

export type ResolveEnv = {
  defaultVoice?: string;
  defaultSpeed?: number;
};

export function resolveJob(
  project: ProjectT,
  manifest: ManifestT,
  env: ResolveEnv = {},
): Readonly<ResolvedJob> {
  const resolved: ResolvedJob = {
    manifest,
    projectSlug: project.slug,
    orgId: project.orgId,
    // template: manifest always names one explicitly (required field), so
    // there's no project/env fallback tier for it — it's not a "default".
    template: manifest.template,
    voice: manifest.audio.voice || project.defaults.voice || env.defaultVoice || 'bm_george',
    speed: manifest.audio.speed ?? project.defaults.speed ?? env.defaultSpeed ?? 1.0,
    outputs: manifest.outputs.length > 0 ? manifest.outputs : project.defaults.outputs,
    // Gates are additive, not overriding — a project can require gates on
    // every job regardless of what the manifest itself asks for.
    gates: Array.from(new Set([...project.gates, ...manifest.gates])),
    providers: { ...project.providers },
  };

  return Object.freeze(resolved);
}
