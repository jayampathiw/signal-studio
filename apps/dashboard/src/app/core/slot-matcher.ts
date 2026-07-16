import { Article } from './supabase.service';

// Per-day slot configuration — mirrors src/services/facebook.js SLOTS_BY_DAY.
// Keep in sync; rationale documented in docs/research/posting-time-analysis.md.
export const SLOTS_BY_DAY: Record<string, Record<string, string[]>> = {
  IT: {
    monday:    ['07:30', '13:00', '22:00'],
    tuesday:   ['07:30', '13:00', '22:00'],
    wednesday: ['07:30', '13:00', '22:00'],
    thursday:  ['07:30', '13:00', '22:00'],
    friday:    ['07:30', '13:00', '22:00'],
    saturday:  ['09:00',          '22:00'],
    sunday:    ['11:00', '13:00', '22:00'],
  },
  FR: {
    monday:    ['07:30',          '22:00'],
    tuesday:   ['07:30', '13:00', '22:00'],
    wednesday: ['07:30', '13:00', '22:00'],
    thursday:  ['07:30', '13:00', '22:00'],
    friday:    ['07:30',          '22:00'],
    saturday:  ['09:00',          '22:00'],
    sunday:    ['09:30',          '22:00'],
  },
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function getSlotsForDate(country: string, date: Date = new Date()): string[] {
  // Use Europe/Paris timezone for day-of-week — both pages publish in CET/CEST.
  const parisDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const dayName = DAY_NAMES[parisDate.getDay()];
  return SLOTS_BY_DAY[country]?.[dayName] ?? [];
}

// Converts a Europe/Paris slot time (e.g. "22:00") to IST (Asia/Kolkata, UTC+5:30).
// Dynamically reads the current Paris UTC offset so it handles CET/CEST automatically.
// Returns "HH:MM" or "HH:MM+1" when the IST time crosses midnight.
export function slotToIST(slot: string): string {
  const [h, m] = slot.split(':').map(Number);
  const now = new Date();
  const parisH = parseInt(
    now.toLocaleString('en-US', { timeZone: 'Europe/Paris', hour12: false, hour: '2-digit' }),
    10,
  ) % 24; // % 24 guards against the '24' midnight quirk in some browsers
  const parisOffsetMin = ((parisH - now.getUTCHours() + 24) % 24) * 60;
  const istRaw = h * 60 + m - parisOffsetMin + 330; // IST = UTC+5:30
  const istMin = ((istRaw % 1440) + 1440) % 1440;
  const nextDay = istRaw >= 1440;
  const istH = Math.floor(istMin / 60);
  const istM = istMin % 60;
  const t = `${String(istH).padStart(2, '0')}:${String(istM).padStart(2, '0')}`;
  return nextDay ? `${t}+1` : t;
}

export type SlotIntent = 'morning' | 'midday' | 'evening';

// Maps a slot time to its editorial intent. Used to match articles to slots
// by content character (not just publish_score).
export function slotIntent(slot: string): SlotIntent {
  const [h] = slot.split(':').map(Number);
  if (h < 11) return 'morning';
  if (h < 17) return 'midday';
  return 'evening';
}

export function slotIntentLabel(intent: SlotIntent, lang: 'en' | 'it' | 'fr' = 'en'): string {
  const labels = {
    en: { morning: 'morning', midday: 'midday', evening: 'evening' },
    it: { morning: 'mattina', midday: 'pranzo',  evening: 'sera' },
    fr: { morning: 'matin',   midday: 'midi',    evening: 'soir' },
  };
  return labels[lang][intent];
}

// Maps an identity_mode to the slot intent it fits best.
const MODE_TO_INTENT: Record<string, SlotIntent> = {
  RESILIENZA:  'morning',
  'RÉSISTANCE': 'morning',
  DIBATTITO:   'midday',
  'DÉBAT':     'midday',
  ORGOGLIO:    'evening',
  'FIERTÉ':    'evening',
  PATRIMONIO:  'evening',
  PATRIMOINE:  'evening',
};

export function bestSlotIntent(article: Article): SlotIntent {
  if (article.source_type === 'historical') return 'evening';
  if (article.criticality === 'breaking') return 'morning';
  const mode = article.content_signals?.identity_mode;
  if (mode && MODE_TO_INTENT[mode]) return MODE_TO_INTENT[mode];
  return 'midday';
}

export function bestSlotForArticle(article: Article, date: Date = new Date()): string | null {
  const slots = getSlotsForDate(article.country, date);
  if (slots.length === 0) return null;
  const intent = bestSlotIntent(article);
  const matching = slots.find(s => slotIntent(s) === intent);
  return matching ?? slots[slots.length - 1];
}

export interface SlotAssignment {
  slot: string;
  intent: SlotIntent;
  article: Article | null;
}

// Returns today's slot shells for a country with no article pre-assigned.
// Articles are only assigned on explicit user pick (see pickTopCandidateForSlot).
export function getTodaySlotShells(country: string, date: Date = new Date()): SlotAssignment[] {
  const slots = getSlotsForDate(country, date);
  return slots.map(slot => ({ slot, intent: slotIntent(slot), article: null }));
}

// Ranked candidates for a given slot: matching intent first (by score desc),
// then any other pending/eligible article as fallback, still sorted by score.
export function candidatesForSlot(
  country: string,
  intent: SlotIntent,
  pendingArticles: Article[],
): Article[] {
  const eligible = pendingArticles
    .filter(a => a.country === country && a.status === 'pending' && a.ai_caption?.intro);
  const matching = eligible
    .filter(a => bestSlotIntent(a) === intent)
    .sort((a, b) => (b.publish_score ?? 0) - (a.publish_score ?? 0));
  const rest = eligible
    .filter(a => bestSlotIntent(a) !== intent)
    .sort((a, b) => (b.publish_score ?? 0) - (a.publish_score ?? 0));
  return [...matching, ...rest];
}

export function pickTopCandidateForSlot(
  country: string,
  intent: SlotIntent,
  pendingArticles: Article[],
  excludeIds: Set<string> = new Set(),
): Article | null {
  const candidates = candidatesForSlot(country, intent, pendingArticles)
    .filter(a => !excludeIds.has(a.id));
  return candidates[0] ?? null;
}
