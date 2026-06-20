/**
 * Engine-agnostic render timeline — the contract between apps/video and packages/render/*.
 * Both FFmpeg and Remotion engines consume this shape; apps/video never imports a renderer directly.
 *
 * @typedef {Object} Timeline
 * @property {string}   contentId
 * @property {'9:16'|'16:9'|'1:1'} aspectRatio
 * @property {TimelineScene[]} scenes
 * @property {MusicTrack}  [music]
 * @property {CtaOverlay}  [cta]
 * @property {Watermark}   [watermark]
 */

/**
 * @typedef {Object} TimelineScene
 * @property {string}  id
 * @property {number}  durationSecs
 * @property {{ localPath: string, type: 'image'|'video' }} source
 * @property {string}  [narrationPath]    local WAV file (Kokoro TTS output)
 * @property {string}  [subtitleSrtPath]  Whisper-generated SRT
 */

/**
 * @typedef {Object} MusicTrack
 * @property {string} path
 * @property {number} fadeOutSecs
 */

/**
 * @typedef {Object} CtaOverlay
 * @property {string} line1
 * @property {string} line2
 * @property {number} durationSecs
 * @property {'end'|'throughout'} position
 */

/**
 * @typedef {Object} Watermark
 * @property {string} path
 * @property {'bottom-right'|'bottom-left'} position
 * @property {number} opacity
 */

export {};
