import { HISTORICAL_STORIES } from '../config/historical-stories.js';

const ANNIVERSARY_WINDOW_DAYS = 14;

function daysUntilAnniversary(anniversaryMMDD, today) {
  if (!anniversaryMMDD) return null;
  const [m, d] = anniversaryMMDD.split('-').map(Number);
  const year = today.getUTCFullYear();
  let next = Date.UTC(year, m - 1, d);
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (next < todayUTC) next = Date.UTC(year + 1, m - 1, d);
  return Math.round((next - todayUTC) / 86_400_000);
}

// Picks the next historical topic for a country, given the set of topic IDs
// already queued recently (caller fetches these from DB).
//
// Priority:
//   1. Topic whose anniversary is within ANNIVERSARY_WINDOW_DAYS — pick closest
//   2. Topic with no anniversary (evergreen filler)
//   3. Topic whose anniversary is further out (round-robin)
// Returns null if every topic for this country has been queued recently.
export function pickNextTopic(country, queuedTopicIds, today = new Date()) {
  const queued = new Set(queuedTopicIds);
  const candidates = HISTORICAL_STORIES
    .filter(t => t.country === country && !queued.has(t.id))
    .map(t => ({ topic: t, daysUntil: daysUntilAnniversary(t.anniversary_date, today) }));

  if (candidates.length === 0) return null;

  const upcoming = candidates
    .filter(c => c.daysUntil !== null && c.daysUntil <= ANNIVERSARY_WINDOW_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  if (upcoming.length > 0) return upcoming[0].topic;

  const evergreen = candidates.filter(c => c.daysUntil === null);
  if (evergreen.length > 0) {
    return evergreen[Math.floor(Math.random() * evergreen.length)].topic;
  }

  candidates.sort((a, b) => a.daysUntil - b.daysUntil);
  return candidates[0].topic;
}

export function topicToOriginalUrl(topicId) {
  return `historical://${topicId}`;
}
