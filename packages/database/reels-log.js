import { createHash } from 'crypto';

import { getClient } from './supabase.js';

// Multilingual stop words (EN / FR / IT) stripped before hashing so
// minor title rephrasing doesn't produce a different hash.
const STOP_WORDS = new Set([
  // English
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'have',
  'that',
  'this',
  'with',
  'they',
  'from',
  'been',
  'will',
  'its',
  // French
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  'de',
  'est',
  'en',
  'et',
  'au',
  'aux',
  'pour',
  'par',
  'sur',
  'dans',
  'qui',
  'que',
  'pas',
  'avec',
  'ses',
  'lui',
  'plus',
  'tout',
  'leur',
  'leurs',
  'ces',
  'cet',
  'cette',
  'nous',
  'vous',
  'ils',
  'elles',
  'dont',
  'lors',
  // Italian
  'il',
  'lo',
  'gli',
  'un',
  'una',
  'del',
  'dei',
  'delle',
  'degli',
  'in',
  'di',
  'da',
  'con',
  'per',
  'su',
  'tra',
  'che',
  'non',
  'alla',
  'alle',
  'agli',
  'dal',
  'nel',
  'nei',
  'nelle',
  'sono',
  'come',
  'anche',
  'dopo',
  'prima',
  'solo',
  'loro',
  'suo',
  'sua',
  'suoi',
  'sue',
]);

// Produce a 16-char hex fingerprint of a topic title.
// Order-independent (words are sorted), multilingual stop-word stripped.
// Consistent across pipelines as long as the stop word list is in sync.
export function hashTopic(title) {
  const words = (title ?? '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .sort();
  return createHash('sha256').update(words.join(' ')).digest('hex').slice(0, 16);
}

// Returns true if the same topic_hash has been logged for this channel
// within the niche's configured dedup window.
// Falls back to 7 days if the niche row is missing or inactive.
export async function isDuplicate(topicHash, channel, niche = 'news') {
  const sb = getClient();

  const { data: cfg } = await sb
    .from('niche_config')
    .select('dedup_days')
    .eq('niche', niche)
    .eq('active', true)
    .single();

  const dedupDays = cfg?.dedup_days ?? 7;
  const since = new Date(Date.now() - dedupDays * 86_400_000).toISOString();

  const { data, error } = await sb
    .from('reels_log')
    .select('id, topic_title, created_at')
    .eq('topic_hash', topicHash)
    .eq('channel', channel)
    .gte('created_at', since)
    .limit(1);

  if (error) throw new Error(`reels_log dedup check failed: ${error.message}`);

  if (data?.length) {
    const prior = data[0];
    const ago = Math.round((Date.now() - new Date(prior.created_at)) / 3_600_000);
    console.warn(
      `  ⚠ Duplicate — "${prior.topic_title}" already posted to ${channel} ${ago}h ago (within ${dedupDays}-day window). Skipping.`,
    );
    return true;
  }

  return false;
}

export async function logReel({
  topicHash,
  topicTitle,
  channel,
  niche = 'news',
  country,
  platform = 'facebook',
  sourceId,
  reelPath,
}) {
  const sb = getClient();
  const { error } = await sb.from('reels_log').insert({
    topic_hash: topicHash,
    topic_title: topicTitle,
    channel,
    niche,
    country: country ?? null,
    platform,
    source_id: sourceId ?? null,
    reel_path: reelPath ?? null,
  });
  if (error) throw new Error(`reels_log insert failed: ${error.message}`);
}
