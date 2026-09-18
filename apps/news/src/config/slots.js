// Countries where boost_eligible=false articles must not be promoted (D3a decision, IT-first)
export const BOOST_ELIGIBLE_ENFORCED = { IT: true, FR: false };

// Posting time slots per country (local CEST time, ±15 min window).
// Per-day structure derived from May 1-27 2026 Meta Insights analysis of both pages.
// Full rationale: docs/research/posting-time-analysis.md
//
// Data-backed signals:
//   - Sunday is the #1 day for BOTH pages (IT avg 26.5 imp, FR avg 19.7 imp)
//   - 22:00 is the #1 evening hour for both (FR avg 20.8, IT avg 20.6)
//   - IT 11:00 is the #1 single hour (Sunday 11:30 was the top IT post at 90 imp)
//   - FR is over-posting at 5.3/day; weak days (Mon, Fri) cut to 2 slots
//   - 19:30 is statistically weak — shifted to 22:00 across the board
export const SLOTS_BY_DAY = {
  IT: {
    monday: ['07:30', '13:00', '22:00'],
    tuesday: ['07:30', '13:00', '22:00'],
    wednesday: ['07:30', '13:00', '22:00'],
    thursday: ['07:30', '13:00', '22:00'],
    friday: ['07:30', '13:00', '22:00'],
    saturday: ['09:00', '22:00'],
    sunday: ['11:00', '13:00', '22:00'], // 11:00 = data-winning hour (top post: Sun 11:30, 90 imp)
  },
  FR: {
    monday: ['07:30', '22:00'], // 2 slots — Mon is weakest (avg 6.7)
    tuesday: ['07:30', '13:00', '22:00'],
    wednesday: ['07:30', '13:00', '22:00'],
    thursday: ['07:30', '13:00', '22:00'], // Thu 07:30 produced a 49-imp top-5 post
    friday: ['07:30', '22:00'], // 2 slots — Fri weak (avg 8.8)
    saturday: ['09:00', '22:00'],
    sunday: ['09:30', '22:00'], // Sun 22:00 = 49 imp single cell (FR's killer slot)
  },
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Returns the slot list for a country on a given date (defaults to today).
// Uses Europe/Paris time zone for day-of-week calculation since both pages publish in CET/CEST.
export function getSlotsForDate(country, date = new Date()) {
  const parisDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const dayName = DAY_NAMES[parisDate.getDay()];
  return SLOTS_BY_DAY[country]?.[dayName] ?? [];
}

// Backward-compat exports — representative weekday slot lists.
// New code should prefer getSlotsForDate(country) instead.
export const SLOTS = {
  IT: SLOTS_BY_DAY.IT.tuesday,
  FR: SLOTS_BY_DAY.FR.tuesday,
};

export const SLOTS_WEEKEND = {
  IT: SLOTS_BY_DAY.IT.sunday,
  FR: SLOTS_BY_DAY.FR.sunday,
};

// E.1 validation window: tracks when the first IT boost_eligible=false post fires.
export function logBoostEligibleWindowStart(country, articleId, postedAt) {
  if (country !== 'IT') return;
  console.log(
    `[E.1 WINDOW] First IT boost_eligible=false post: article=${articleId} posted_at=${postedAt}`,
  );
  console.log(
    `[E.1 WINDOW] 30-day window closes: ${new Date(new Date(postedAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()}`,
  );
  console.log(
    `[E.1 WINDOW] If zero policy strikes by that date → flip BOOST_ELIGIBLE_ENFORCED.FR to true`,
  );
}
