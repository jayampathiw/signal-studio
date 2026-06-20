import axios from 'axios';
import { env } from '@content-platform/config';

const PEXELS_BASE = 'https://api.pexels.com/videos';

// Returns a list of normalized clips:
//   { sourceId, url, durationSec, width, height, attribution, license, description }
//
// Pexels licence: free for commercial use, no attribution required.
export async function fetch({ query, perPage = 15, orientation = 'portrait', minDuration = 5 }) {
  const apiKey = env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY is not set');

  const res = await axios.get(`${PEXELS_BASE}/search`, {
    params: { query, per_page: perPage, orientation, size: 'medium' },
    headers: { Authorization: apiKey },
    timeout: 30_000,
  });

  const videos = res.data.videos || [];
  const clips = [];

  for (const v of videos) {
    if (v.duration < minDuration) continue;

    // Prefer HD portrait files at 1080p, fall back to highest-portrait available
    const portraitFiles = (v.video_files || [])
      .filter(f => f.file_type === 'video/mp4' && f.height > f.width);

    if (portraitFiles.length === 0) continue;

    portraitFiles.sort((a, b) => {
      const aIdeal = a.height === 1920 ? 0 : Math.abs(a.height - 1920);
      const bIdeal = b.height === 1920 ? 0 : Math.abs(b.height - 1920);
      return aIdeal - bIdeal;
    });
    const file = portraitFiles[0];

    clips.push({
      sourceId: String(v.id),
      url: file.link,
      durationSec: v.duration,
      width: file.width,
      height: file.height,
      attribution: v.user?.name || 'Pexels',
      license: 'Pexels License',
      description: v.tags?.join(', ') || query,
    });
  }

  return clips;
}
