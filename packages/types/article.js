/**
 * @typedef {Object} Article
 * @property {string}  id
 * @property {string}  title
 * @property {string}  summary
 * @property {string}  url
 * @property {string}  source_name
 * @property {string}  country          FR | IT | AU | SE | …
 * @property {'pending'|'posted'|'failed'|'blocked'|'manual_review'} status
 * @property {number}  publish_score
 * @property {number}  criticality
 * @property {string[]} tags
 * @property {AiCaption|null} ai_caption
 * @property {string|null}    seo_title
 * @property {string|null}    seo_description
 * @property {string|null}    image_prompt
 * @property {string|null}    formatted_image_prompt
 * @property {string|null}    image_url
 * @property {'image'|'video'|'poll'|'carousel'|null} recommended_format
 * @property {'image'|'video'|'poll'|'carousel'|null} post_format
 * @property {string}  created_at
 * @property {string|null} posted_at
 */

/**
 * @typedef {Object} AiCaption
 * @property {string} intro
 * @property {string} question
 * @property {string} cta
 * @property {string} image_headline
 */

export {};
