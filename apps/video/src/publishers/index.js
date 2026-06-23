import * as facebook  from './facebook.js';
import * as instagram from './instagram.js';
import * as youtube   from './youtube.js';
import * as tiktok    from './tiktok.js';

const PUBLISHERS = {
  facebook,
  instagram,
  youtube,
  tiktok,
};

export function getPublisher(platform) {
  const p = PUBLISHERS[platform];
  if (!p) throw new Error(`No publisher implemented for platform: ${platform}`);
  return p;
}

// Publishes a content item to every enabled platform on the channel.
// Returns an array of per-platform results. One platform's failure does NOT
// block the others — each result contains { platform, ok, postId?, error? }.
export async function publishToAll(contentItem, channelConfig) {
  const results = [];
  for (const [platform, cfg] of Object.entries(channelConfig.platforms)) {
    if (!cfg.enabled) continue;
    if (!PUBLISHERS[platform]) {
      results.push({ platform, ok: false, error: 'not implemented yet (waiting on milestone)' });
      continue;
    }
    try {
      const { postId, postedAt, platformUrl } = await PUBLISHERS[platform].publish(contentItem, channelConfig);
      results.push({ platform, ok: true, postId, postedAt, platformUrl });
    } catch (e) {
      results.push({ platform, ok: false, error: e.message });
    }
  }
  return results;
}
