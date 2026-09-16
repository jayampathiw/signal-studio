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
 * @property {string}      [template]  which composition to render (Remotion engine only); defaults to 'news-card'
 * @property {CaseMeta}    [caseMeta]  case-level metadata (policy-file/case-file/EN)
 */

/**
 * @typedef {Object} TimelineScene
 * @property {string}  id
 * @property {number}  durationSecs
 * @property {{ localPath: string, type: 'image'|'video' }} [source]  omit for a text/narration-only scene (no document/footage)
 * @property {string}  [narrationPath]    local WAV file (Kokoro TTS output)
 * @property {string}  [subtitleSrtPath]  Whisper-generated SRT
 * @property {string}  [captionText]      on-screen caption text (policy-file/case-file/EN)
 * @property {HighlightBox} [highlight]   manually-authored evidence highlight box (policy-file/case-file/EN); shorthand for a single-entry `highlights`
 * @property {HighlightBox[]} [highlights]  sequential evidence highlight boxes shown one at a time within the scene, each with its own fromSec/toSec (policy-file/case-file/EN)
 * @property {ZoomRegion} [zoomFrom]      document region the camera starts on (policy-file/case-file/EN); defaults to the full page, or the previous scene's zoomTo when the same document continues
 * @property {ZoomRegion} [zoomTo]        document region the camera pushes/pans to by scene end (policy-file/case-file/EN); defaults to zoomFrom (static hold)
 * @property {Object} [visual]  non-document scene graphic (data-viz format) — {kind:'counter'|'barChart'|'mechanism'|'resolution'|'speechBubbles', ...kind-specific params}; see compositions/case-file/charts/*. When set, takes over the scene instead of the document/highlight/zoom fields.
 * @property {boolean} [waveformOverlay]  overlay an animated waveform graphic on a stock-video scene (source.type === 'video')
 * @property {CaptionWord[]} [words]  per-word timing for the "Highlighter Sweep" caption style (scene-relative seconds); omit to render captionText as a plain static line
 */

/**
 * @typedef {Object} CaptionWord
 * @property {string} text
 * @property {number} start  scene-relative seconds when this word begins being spoken
 * @property {number} end    scene-relative seconds when this word finishes being spoken
 */

/**
 * @typedef {Object} HighlightBox
 * @property {number} x        fraction (0-1) of image width
 * @property {number} y        fraction (0-1) of image height
 * @property {number} width    fraction (0-1) of image width
 * @property {number} height   fraction (0-1) of image height
 * @property {number} fromSec  scene-relative seconds when the highlight animates in
 * @property {number} toSec    scene-relative seconds when the highlight is fully shown until
 * @property {number} [opacity] max highlight opacity multiplier, 0-1 (default 0.55) — e.g. dim a carried-over highlight in a later scene
 */

/**
 * @typedef {Object} ZoomRegion
 * @property {number} x       fraction (0-1) of document page width
 * @property {number} y       fraction (0-1) of document page height
 * @property {number} width   fraction (0-1) of document page width
 * @property {number} height  fraction (0-1) of document page height
 */

/**
 * @typedef {Object} CaseMeta
 * @property {string} caseId
 * @property {string} [sourceCitation]
 * @property {boolean} [specimen]  true renders a persistent on-screen "SPECIMEN — NOT A REAL CASE" badge (policy-file/case-file/EN) — required whenever the document shown is an illustrative template, not a real sourced case
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
