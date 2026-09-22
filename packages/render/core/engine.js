/**
 * RenderEngine — the contract every render implementation must satisfy.
 * Both packages/render/ffmpeg and packages/render/remotion implement this interface.
 * apps/video never imports a renderer directly — it calls render() from this package.
 *
 * @typedef {Object} RenderEngine
 * @property {string} name  'ffmpeg' | 'remotion'
 * @property {RenderFn} render
 */

/**
 * @callback RenderFn
 * @param {import('@signal-studio/core/schemas').TimelineT} timeline
 * @param {{ outputDir: string }} opts
 * @returns {Promise<string>} absolute path to the rendered MP4
 */

// P2.5: was `@signal-studio/types/timeline`'s JSDoc typedef — render.ts
// itself switched to the zod-inferred TimelineT at P2.1 ("timeline.v1 —
// a strict superset of every field..."), but this contract type (what
// `registerEngine()`'s parameter is actually checked against) was never
// updated to match, so the mismatch stayed invisible until something
// outside packages/render/remotion's own (deliberately excluded, see
// scripts/typecheck.mjs) tsconfig imported it transitively and forced a
// real check — apps/worker's `deps.ts` did exactly that.

/** @type {Map<string, RenderEngine>} */
const registry = new Map();

/**
 * Register a render engine implementation.
 * Called by packages/render/ffmpeg and packages/render/remotion at import time.
 *
 * @param {RenderEngine} engine
 */
export function registerEngine(engine) {
  registry.set(engine.name, engine);
}

/**
 * @param {string} name
 * @returns {RenderEngine}
 */
export function getEngine(name) {
  const engine = registry.get(name);
  if (!engine)
    throw new Error(`Render engine not registered: "${name}". Import it before calling render().`);
  return engine;
}
