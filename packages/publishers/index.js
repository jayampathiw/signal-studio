import { postToFacebook } from './facebook.js';

// Fanout router — publishes content to all enabled platforms for a given channel.
// Each platform client is imported lazily to avoid missing-env errors at startup
// when platforms are not yet configured.

/**
 * @param {{ platform: string, pageKey: string, content: object }} opts
 */
export async function publish({ platform, pageKey, content }) {
  switch (platform) {
    case 'facebook':
      return postToFacebook(pageKey, content);
    case 'instagram': {
      const { postToInstagram } = await import('./instagram.js');
      return postToInstagram(pageKey, content);
    }
    case 'youtube': {
      const { postToYouTube } = await import('./youtube.js');
      return postToYouTube(pageKey, content);
    }
    case 'tiktok': {
      const { postToTikTok } = await import('./tiktok.js');
      return postToTikTok(pageKey, content);
    }
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
