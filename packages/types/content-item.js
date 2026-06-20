/**
 * @typedef {Object} ContentItem
 * @property {string}  id
 * @property {string}  channel_id
 * @property {string}  topic
 * @property {string}  narration
 * @property {'pending'|'rendered'|'posted'|'failed'} status
 * @property {'stock'|'ai-image'|'seedance'} source_mode
 * @property {'ffmpeg'|'remotion'} render_engine
 * @property {string|null} r2_url          public MP4 URL after render
 * @property {Scene[]}     scenes
 * @property {string}  created_at
 */

/**
 * @typedef {Object} Scene
 * @property {number} index
 * @property {string} narration
 * @property {string} [image_prompt]
 * @property {string} [clip_url]        Pexels/Pixabay URL (stock mode)
 * @property {string} [image_url]       fal.ai URL (ai-image mode)
 * @property {number} duration_secs
 */

export {};
