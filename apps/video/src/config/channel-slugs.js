// Maps the short channel slug used in reel-pipeline / runner.sh to
// the canonical channel_key stored in content_items and the Claude skill name.
// Add a new entry here when a channel launches.

export const CHANNEL_SLUGS = {
  'wild-eye': {
    channelKey: 'wildlife/intimacy/EN',
    skill: 'wild-eye-reel',
    pageName: 'Wild Capture',
  },
  // 'sports': {
  //   channelKey: 'sports/highlights/EN',
  //   skill:      'sports-reel',
  //   pageName:   'Sports Clips',
  // },
  // 'cartoon': {
  //   channelKey: 'cartoon/comedy/EN',
  //   skill:      'cartoon-reel',
  //   pageName:   'Cartoon World',
  // },
};

export function resolveChannelSlug(slug) {
  const entry = CHANNEL_SLUGS[slug];
  if (!entry) {
    throw new Error(
      `Unknown channel slug: "${slug}". Valid slugs: ${Object.keys(CHANNEL_SLUGS).join(', ')}`,
    );
  }
  return entry;
}
