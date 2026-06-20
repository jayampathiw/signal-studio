// Tag classifier — regex-based, no AI. Both the recompute-scores cron job and
// the Deno edge function (verbatim copy of these patterns) call this.
//
// Display order is consumed by the dashboard for the table-row 3-chip cap.
// DB stores every match; the UI does the ranking and capping.

const PATRIOTIC_PATTERN = /\b(victoire|victory|vittoria|seger|champion|médaille|medaglia|medalj|medal|award|prix|premio|pris|record|exploit|succès|successo|framgång|fierté|pride|orgoglio|stolthet|historique|historico|historisk|first\s+ever|premier\s+(français|italian)|nationale?)\b/i;

const SOCIAL_PATTERN = /\b(retraite|pension|pensionné|retraité|pensionato|pensionista|ålderspension|logement|loyer|immobilier|appartement|alloggio|affitto|bostad|hyra|emploi|chômage|licenciement|salaire|lavoro|disoccupazione|stipendio|arbete|lön|famille|enfant|parent|scuola|familj|barn|skola)\b/i;

const HEALTH_PATTERN = /\b(salute|sanitari[oa]?|sanitarie|malatt[ia]|ospedale|medic[oi]|farmac[io]|vaccin[oi]?|cura|santé|sanitaire|hôpital|maladie|cancer|médicament|hälsa|sjukhus)\b/i;

const PRICES_PATTERN = /\b(rincaro|prezzi|prezzo|bollett[ea]|spesa|carovita|povert[àa]|pension[ei]|pouvoir\s+d.achat|coût\s+de\s+la\s+vie|hausse|inflation|economia|tasse|ekonomi)\b/i;

const JUSTICE_PATTERN = /\b(giustizia|ingiustizia|vittima|truffa|truffe|tribunale|condann[ao]|omicidi[io]?|violenza|sicurezza|justice|victime|tribunal|condamn[eé]e?|meurtre|agression)\b/i;

const SPORT_PATTERN = /\b(football|rugby|tennis|cyclisme|ligue\s+1|serie\s+a|top\s+14|tour\s+de\s+france|roland[-\s]garros|champions\s+league|coupe\s+du\s+monde|coppa\s+del\s+mondo|nazionale|azzurri|équipe\s+de\s+france|les\s+bleus|olympique|PSG|\bOM\b|OGC\s+Nice|RC\s+Toulon|Stade\s+Toulousain|Juventus|Inter|Milan|Napoli)\b/i;

const OFF_TARGET_PATTERN = /\b(OTAN|NATO|vertice\s+NATO|défense\s+europ|spese\s+militari|geopolitica|geopolitique|fiscalité\s+d.entreprise|tassa\s+di\s+gruppo|imposte\s+societarie|déficit\s+structurel|debito\s+pubblico\s+strutturale|riforma\s+fiscale\s+complessa)\b/i;

const FR_PLACE_NAMES = /\b(Paris|Lyon|Marseille|Toulouse|Nice|Nantes|Strasbourg|Montpellier|Bordeaux|Lille|Rennes|Toulon|Avignon|Hyères|Perpignan|Aix[-\s]en[-\s]Provence|Provence|Côte\s+d['']Azur|Occitanie|PACA)\b/i;

const IT_PLACE_NAMES = /\b(Roma|Milano|Napoli|Torino|Palermo|Genova|Bologna|Firenze|Bari|Catania|Venezia|Verona|Lazio|Lombardia|Campania|Sicilia|Veneto)\b/i;

const REGIONAL_SOURCES = new Set([
  'La Provence', 'Nice-Matin', 'Midi Libre',
  'Roma Today', 'ANSA Cronaca',
  'Il Resto del Carlino', 'Il Messaggero', 'Il Secolo XIX', 'La Gazzetta del Mezzogiorno',
]);

const SPORT_SOURCES = new Set([
  "L'Équipe",
  'La Gazzetta dello Sport',
]);

export const TAG_DISPLAY_ORDER = [
  'off_target',
  'patriotic',
  'health',
  'justice',
  'prices',
  'region',
  'sport',
  'social',
];

export function tagArticle(article) {
  const tags = [];
  const text = `${article.title || ''} ${article.summary || ''}`;
  const source = article.source || '';
  const country = article.country;

  if (OFF_TARGET_PATTERN.test(text)) tags.push('off_target');
  if (PATRIOTIC_PATTERN.test(text)) tags.push('patriotic');
  if (HEALTH_PATTERN.test(text))    tags.push('health');
  if (JUSTICE_PATTERN.test(text))   tags.push('justice');
  if (PRICES_PATTERN.test(text))    tags.push('prices');

  const placeRegex = country === 'FR' ? FR_PLACE_NAMES
                   : country === 'IT' ? IT_PLACE_NAMES
                   : null;
  const isRegionalSource = REGIONAL_SOURCES.has(source);
  const hasPlace = placeRegex && placeRegex.test(text);
  if (isRegionalSource || hasPlace) tags.push('region');

  const isSportSource = SPORT_SOURCES.has(source);
  const isSportCategory = article.story_category === 'Sport';
  if (isSportSource || isSportCategory || SPORT_PATTERN.test(text)) tags.push('sport');

  if (SOCIAL_PATTERN.test(text)) tags.push('social');

  return tags;
}
