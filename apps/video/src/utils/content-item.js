import { listEnabledPlatforms } from '../config/channels.js';

export function newContentItem(channelKey, channel, sourceType, sourceQuery, sourceClips) {
  return {
    channel_key: channelKey,
    niche: channel.niche,
    style: channel.style,
    language: channel.language,
    source_type: sourceType,
    source_query: sourceQuery,
    source_clips: sourceClips,
    target_platforms: listEnabledPlatforms(channel),
    status: 'pending',
  };
}

export function platformStatusCols(platform) {
  const prefix = { facebook: 'fb', instagram: 'ig', youtube: 'yt', tiktok: 'tt' }[platform];
  if (!prefix) throw new Error(`Unknown platform: ${platform}`);
  return {
    status:   `${prefix}_status`,
    postId:   `${prefix}_post_id`,
    videoId:  `${prefix}_video_id`,
    postedAt: `${prefix}_posted_at`,
    error:    `${prefix}_error`,
  };
}
