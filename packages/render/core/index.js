export { registerEngine, getEngine } from './engine.js';

/**
 * Render a Timeline to an MP4 using the specified engine.
 * The engine must have been registered (imported) before calling this.
 *
 * @param {import('@signal-studio/types/timeline').Timeline} timeline
 * @param {{ engine: string, outputDir: string }} opts
 * @returns {Promise<string>} path to rendered MP4
 */
export async function render(timeline, { engine: engineName, outputDir }) {
  const { getEngine } = await import('./engine.js');
  const engine = getEngine(engineName);
  return engine.render(timeline, { outputDir });
}
