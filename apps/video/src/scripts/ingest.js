// CLI: fetch source clips for a channel and insert ONE content_item row.
//
// Usage:
//   node apps/video/src/scripts/ingest.js <channel_key>
//   node apps/video/src/scripts/ingest.js wildlife/factual/EN

import { insertContentItem } from '@signal-studio/database/content-items';

import { getChannel } from '../config/channels.js';
import * as pexels from '../fetchers/pexels.js';
import { pickTopic, TOPIC_FIRST_MODES } from '../services/ai.js';
import { newContentItem } from '../utils/content-item.js';

const FETCHERS = { pexels };

async function main() {
  const channelKey = process.argv[2];
  if (!channelKey) {
    console.error('Usage: node apps/video/src/scripts/ingest.js <channel_key>');
    process.exit(1);
  }

  const channel = getChannel(channelKey);
  if (!channel.fetchers) {
    throw new Error(
      `Channel "${channelKey}" uses source="${channel.source}" and is not supported by ingest.js. Use the channel skill instead.`,
    );
  }
  console.log(`[ingest] channel: ${channelKey} (${channel.style} mode)`);

  // Topic-first: pick a specific animal + angle before fetching clips.
  // Only applies to factual/listicle — cinematic/silent are mood-driven.
  let topicContext = null;
  if (TOPIC_FIRST_MODES.has(channel.style)) {
    console.log('[ingest] picking topic via Claude...');
    topicContext = await pickTopic({
      niche: channel.niche,
      mode: channel.style,
      language: channel.language,
    });
    const angleLabel = topicContext.angle ? ` — "${topicContext.angle}"` : '';
    console.log(`[ingest] topic: ${topicContext.animal}${angleLabel}`);
    console.log(`[ingest] search: "${topicContext.searchQuery}"`);
  }

  const allClips = [];
  for (const fetcherCfg of channel.fetchers) {
    const fetcher = FETCHERS[fetcherCfg.type];
    if (!fetcher) {
      console.warn(`[ingest] no fetcher for type=${fetcherCfg.type}, skipping`);
      continue;
    }
    const effectiveQuery = topicContext ? topicContext.searchQuery : fetcherCfg.query;
    const effectivePerPage = topicContext
      ? Math.max(fetcherCfg.perPage || 15, 30)
      : fetcherCfg.perPage || 15;
    console.log(
      `[ingest] fetching from ${fetcherCfg.type}: query="${effectiveQuery}" perPage=${effectivePerPage}`,
    );
    const clips = await fetcher.fetch({
      ...fetcherCfg,
      query: effectiveQuery,
      perPage: effectivePerPage,
    });
    console.log(`[ingest]   got ${clips.length} clips`);
    allClips.push(
      ...clips.map((c) => ({
        ...c,
        sourceType: fetcherCfg.type,
        sourceQuery: effectiveQuery,
        ...(topicContext && { topicAnimal: topicContext.animal, topicAngle: topicContext.angle }),
      })),
    );
  }

  // Filter to single-species clips when topic-first is active
  let candidateClips = allClips;
  if (topicContext) {
    const DESCRIPTORS = new Set([
      'baby',
      'cute',
      'small',
      'wild',
      'young',
      'little',
      'tiny',
      'big',
    ]);
    const keywords = topicContext.animal
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/s$/, ''))
      .filter((w) => w.length > 2 && !DESCRIPTORS.has(w));
    const matchTerms = keywords.length > 0 ? keywords : [topicContext.animal.toLowerCase()];

    const matched = allClips.filter((c) => {
      const tags = (c.description || '').toLowerCase().split(/,\s*|\s+/);
      return matchTerms.some((kw) => tags.some((tag) => tag.includes(kw)));
    });

    if (matched.length >= channel.rendererConfig.clipsPerReel) {
      console.log(
        `[ingest] species filter: ${matched.length}/${allClips.length} clips match "${topicContext.animal}"`,
      );
      candidateClips = matched;
    } else {
      console.warn(
        `[ingest] species filter: only ${matched.length} clips matched "${topicContext.animal}" — using all ${allClips.length}`,
      );
    }
  }

  if (candidateClips.length < channel.rendererConfig.clipsPerReel) {
    throw new Error(
      `Not enough clips (${candidateClips.length}) to make a reel of ${channel.rendererConfig.clipsPerReel} clips`,
    );
  }

  const chosen = candidateClips.slice(0, channel.rendererConfig.clipsPerReel);
  const row = newContentItem(
    channelKey,
    channel,
    chosen[0].sourceType,
    chosen[0].sourceQuery,
    chosen,
  );
  const inserted = await insertContentItem(row);
  console.log(`[ingest] created content_item id=${inserted.id} with ${chosen.length} clips`);
  if (topicContext) console.log(`[ingest] animal: ${topicContext.animal}`);
  console.log(`[ingest] next: node apps/video/src/scripts/generate-reel.js ${inserted.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
