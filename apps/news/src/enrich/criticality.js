const BREAKING_KEYWORDS =
  /\b(urgence|URGENT|alerte\s+rouge|flash|breaking|mort|décès|tué|assassiné|attentat|crash|catastrophe|tremblement\s+de\s+terre|tsunami|ouragan|explosion|incendie\s+majeur|fusillade|attaque|prise\s+d.otage|mort[oi]|uccis[oi]|attentato|terremoto|tsunami|uragano|esplosione|incendio\s+grave|sparatoria|attacco|omicidio|killed|dead|attack|explosion|crash|disaster|earthquake|hurricane|tsunami|shooting|stabbing|fire|terror)\b/i;

const ALERT_KEYWORDS =
  /\b(grève|manifestation|protestation|crise|scandale|démission|licenciement|rappel|alerte|blessé|blessés|hospitalisé|sciopero|manifestazione|crisi|scandalo|dimissioni|licenziamento|richiamo|ferit[io]|ospedalizzat[io]|strike|protest|crisis|scandal|resignation|recall|alert|injured|hospitalized)\b/i;

const TRENDING_KEYWORDS =
  /\b(record|victoire|champion|classement|popularité|tendance|viral|buzz|sondage|primeur|révélation|annonce|décision|vote|débat|record|vittoria|campione|classifica|popolarità|tendenza|sondaggio|rivelazione|annuncio|decisione|voto|dibattito|winner|champion|ranking|trend|poll|reveal|announcement|decision|vote|debate)\b/i;

// Named geographic areas for regional-specific scoring
export const FR_PLACE_NAMES =
  /\b(Paris|Lyon|Marseille|Toulouse|Nice|Nantes|Strasbourg|Montpellier|Bordeaux|Lille|Rennes|Toulon|Avignon|Hyères|Perpignan|Aix[-\s]en[-\s]Provence|Provence|Côte\s+d['']Azur|Occitanie|PACA)\b/i;
export const IT_PLACE_NAMES =
  /\b(Roma|Milano|Napoli|Torino|Palermo|Genova|Bologna|Firenze|Bari|Catania|Venezia|Verona|Lazio|Lombardia|Campania|Sicilia|Veneto)\b/i;
export const IT_DEMOGRAPHIC_RESONANCE =
  /\b(pensione|pensioni|sanità|famiglia|figli|anzian[io]|disabilità|ospedale|farmaci|prezzi|bollette|affitti|lavoro|disoccupazione)\b/i;

export function classifyArticle(article) {
  const text = `${article.title || ''} ${article.summary || ''}`;
  let criticality = 'standard';
  let priority_score = 25;

  if (BREAKING_KEYWORDS.test(text)) {
    criticality = 'breaking';
    priority_score = 90;
  } else if (ALERT_KEYWORDS.test(text)) {
    criticality = 'alert';
    priority_score = 65;
  } else if (TRENDING_KEYWORDS.test(text)) {
    criticality = 'trending';
    priority_score = 45;
  }

  // Country-specific resonance bonuses
  if (article.country === 'FR' && FR_PLACE_NAMES.test(text)) priority_score += 10;
  if (article.country === 'IT' && IT_PLACE_NAMES.test(text)) priority_score += 8;
  if (article.country === 'IT' && IT_DEMOGRAPHIC_RESONANCE.test(text)) priority_score += 12;

  return { criticality, priority_score };
}
