import { PILLARS, SLOT_PILLARS } from '../config/pillars.js';

const CRIT_PRIORITY = { breaking: 4, alert: 3, trending: 2, standard: 1 };

function cestTimeNow() {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

export function nearestSlot(country, slots) {
  const now = cestTimeNow();
  const [nowH, nowM] = now.split(':').map(Number);
  const nowMins = nowH * 60 + nowM;

  let closest = null;
  let closestDiff = Infinity;
  let inWindow = false;

  for (const slot of slots) {
    const [sH, sM] = slot.split(':').map(Number);
    const slotMins = sH * 60 + sM;
    const diff = Math.abs(nowMins - slotMins);
    if (diff <= 15) inWindow = true;
    if (diff < closestDiff) { closestDiff = diff; closest = slot; }
  }

  return { closest, inWindow, diffMinutes: closestDiff };
}

function pillarQuotaFactor(pillar, country, weeklyCounts) {
  const config = PILLARS[country]?.[pillar];
  if (!config) return 0;
  const actual = weeklyCounts[pillar] ?? 0;
  const target = config.target_per_week;
  if (actual < target) return 0.5;
  if (actual > target) return -0.5;
  return 0;
}

function slotMatchFactor(pillar, country, slots) {
  const slotObj = SLOT_PILLARS[country];
  if (!slotObj || !pillar) return 0.5;
  const { closest } = nearestSlot(country, slots);
  if (!closest) return 0.5;
  return (slotObj[closest] ?? []).includes(pillar) ? 1.0 : 0.5;
}

function recencyFactor(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return Math.exp(-ageHours / 24);
}

export function computeEditorialScore(article) {
  const base = article.priority_score ?? 25;
  const googleTrendsBonus = (article.source ?? '').startsWith('Google Trends') ? 25 : 0;
  const ageHours = (Date.now() - new Date(article.created_at ?? Date.now()).getTime()) / 3_600_000;
  const recencyBonus = ageHours < 2 ? 15 : ageHours < 6 ? 10 : ageHours < 12 ? 5 : 0;
  return base + googleTrendsBonus + recencyBonus;
}

export function computePublishScore(article, weeklyCounts, slots) {
  const critPriority = CRIT_PRIORITY[article.criticality] ?? 1;
  const slotFactor   = slotMatchFactor(article.pillar, article.country, slots);
  const quotaFactor  = pillarQuotaFactor(article.pillar, article.country, weeklyCounts);
  const recency      = recencyFactor(article.created_at);

  return (
    critPriority * 40 +
    slotFactor   * 30 +
    quotaFactor  * 20 +
    recency      * 10
  );
}
