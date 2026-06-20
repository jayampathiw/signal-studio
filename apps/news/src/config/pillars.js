export const PILLARS = {
  FR: {
    'france-en-debat':    { target_per_week: 9,  blocked_until: null },
    'fierte-francaise':   { target_per_week: 4,  blocked_until: null },
    'le-monde-vu-paris':  { target_per_week: 4,  blocked_until: null },
    'sondage-du-jour':    { target_per_week: 1,  blocked_until: null },
    'retour-sur':         { target_per_week: 1,  blocked_until: 'evergreen_tables' },
    'ma-ville-aujourdhui':{ target_per_week: 2,  blocked_until: null },
    'sport-francais':     { target_per_week: 3,  blocked_until: null },
  },
  IT: {
    'fatto-del-giorno':   { target_per_week: 5,  blocked_until: null },
    'italia-nel-mondo':   { target_per_week: 3,  blocked_until: null },
    'capire-la-legge':    { target_per_week: 2,  blocked_until: 'carousel_renderer' },
    'azzurri':            { target_per_week: 3,  blocked_until: null },
    'italia-che-funziona':{ target_per_week: 1,  blocked_until: null },
    'storie-italiane':    { target_per_week: 2,  blocked_until: null },
    'la-mia-citta':       { target_per_week: 2,  blocked_until: null },
    'vaticano':           { target_per_week: 1,  blocked_until: null },
  },
};

export const SLOT_PILLARS = {
  FR: {
    '07:30': ['france-en-debat', 'le-monde-vu-paris'],
    '12:00': ['sondage-du-jour', 'fierte-francaise', 'sport-francais'],
    '19:00': ['ma-ville-aujourdhui', 'retour-sur', 'france-en-debat', 'sport-francais'],
  },
  IT: {
    '07:30': ['fatto-del-giorno', 'italia-nel-mondo'],
    '11:30': ['capire-la-legge', 'italia-che-funziona'],
    '15:30': ['azzurri', 'storie-italiane'],
    '19:30': ['vaticano', 'la-mia-citta', 'fatto-del-giorno', 'storie-italiane'],
  },
};

export function isPillarBlocked(pillar, country) {
  return !!(PILLARS[country]?.[pillar]?.blocked_until);
}
