// Smoke test: verify caption building logic for Wild Eye and legacy rows.
// Run with: node apps/video/test/caption-smoke.mjs

import assert from 'node:assert/strict';

// Inline the caption logic from facebook.js so this runs without live credentials.
function buildCaption(contentItem) {
  if (contentItem.seo?.description) {
    const { description, hashtags = [] } = contentItem.seo;
    const hashtagLine = hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ');
    return {
      caption: [description, hashtagLine].filter(Boolean).join('\n\n'),
      title: contentItem.seo.title || contentItem.title || '',
    };
  }
  const { intro, question, cta } = contentItem.ai_caption || {};
  const captionParts = [intro, question, cta].filter(Boolean);
  const hashtagLine = (contentItem.hashtags || []).map((h) => `#${h.replace(/^#/, '')}`).join(' ');
  if (hashtagLine) captionParts.push(hashtagLine);
  return { caption: captionParts.join('\n\n'), title: contentItem.title || '' };
}

// ── Wild Eye row (seo jsonb) ──────────────────────────────────────────────────

const wildEyeRow = {
  id: 1,
  seo: {
    title: '🦔 The pup that held its breath',
    description:
      'In the darkness of the burrow, one small paw twitches and stills.\n\nNature holds its breath.\n\nFollow for more hidden moments from the wild.',
    hashtags: ['wildlifephotography', 'cavy', 'hiddenworld'],
  },
  rendered_video_url: 'https://r2.example.com/clip.mp4',
};

const { caption: weCaption, title: weTitle } = buildCaption(wildEyeRow);

assert.ok(weCaption.length > 0, 'Wild Eye caption must be non-empty');
assert.ok(
  weCaption.includes('Follow for more hidden moments from the wild.'),
  'Wild Eye caption must end with house-rule phrase',
);
assert.ok(weCaption.includes('#wildlifephotography'), 'Wild Eye caption must include hashtags');
assert.equal(weTitle, '🦔 The pup that held its breath', 'Wild Eye title must come from seo.title');

// ── Legacy news/pexels row ────────────────────────────────────────────────────

const legacyRow = {
  id: 2,
  ai_caption: {
    intro: 'Spotted in the wild.',
    question: 'Have you ever seen this?',
    cta: 'Follow NaturePulse.',
  },
  hashtags: ['wildlife', 'nature'],
  title: 'Nature reel',
  rendered_video_url: 'https://r2.example.com/reel.mp4',
};

const { caption: legCaption, title: legTitle } = buildCaption(legacyRow);

assert.ok(legCaption.includes('Spotted in the wild.'), 'Legacy caption must include intro');
assert.ok(legCaption.includes('#wildlife'), 'Legacy caption must include hashtags');
assert.equal(legTitle, 'Nature reel', 'Legacy title must come from contentItem.title');

// ── Row with no seo AND no ai_caption (edge case — should produce empty string) ─

const emptyRow = { id: 3, rendered_video_url: 'https://r2.example.com/x.mp4' };
const { caption: emptyCaption } = buildCaption(emptyRow);
assert.equal(
  emptyCaption,
  '',
  'Row with no caption fields should produce empty string (publish.js will throw)',
);

console.log('✅ caption-smoke: all assertions passed');
