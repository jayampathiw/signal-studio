// Safe-harbor phrases (80 total, 20 per language).
// When present, WARNING-tier rules are bypassed (journalistic reporting context).
const SAFE_HARBOR_PHRASES = {
  fr: ['selon le parquet','communiqué officiel','cour d\'assises','procès en cours','audience publique','verdict prononcé','jugement rendu','mise en examen','selon la police','fact-check','démenti','selon une étude','essai clinique','publié dans','Suicide Écoute 3114','numéro d\'aide','alerte AMF','arnaque dénoncée','selon le rapport','communiqué de presse'],
  it: ['secondo l\'accusa','la procura sostiene','sentenza confermata','processo in corso','udienza pubblica','verdetto pronunciato','secondo la polizia','operazione antimafia','fact-check','smentito','secondo uno studio','sperimentazione clinica','pubblicato su','Telefono Amico','numero verde','CONSOB avverte','truffa denunciata','secondo il rapporto','comunicato stampa','report DIA'],
  en: ['according to police','court documents reveal','sentenced by','convicted at','trial begins','public hearing','royal commission found','ICAC found','fact-checked','debunked','according to a study','clinical trial','published in','Lifeline 13 11 14','prevention helpline','ASIC warning','Ponzi scheme uncovered','according to the report','press release','official statement'],
  sv: ['enligt åklagaren','rättegång inleds','högsta domstolen avgjorde','döms för','offentlig dom','enligt polisen','Brottsförebyggande rådet','IMY meddelar','fact-check','tillbakavisat','enligt en studie','klinisk prövning','publicerad i','Mind 1177','stödlinje','Finansinspektionen varnar','bedrägeri avslöjat','enligt rapporten','pressmeddelande','officiellt uttalande'],
};

const SAFE_HARBOR = new RegExp(
  Object.values(SAFE_HARBOR_PHRASES).flat()
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'i'
);

// ─── ABSOLUTE — silently dropped, never saved ─────────────────────────────────
const ABSOLUTE_RULES = [
  {
    id: 'CHILD_SAFETY_01',
    reason: 'Minor + sexual/violent context (Meta CSEA — page_removal risk)',
    test(text) {
      const MINOR = /\b(mineur|enfant|adolescent|fillette|minor(?:e|enne|i)?|bambin[oai]|ragazzin[oa]|neonato|child(?:ren)?|kid|teen(?:ager|age)?|underage|schoolgirl|schoolboy|toddler|infant|baby|preteen|\d{1,2}[-\s]?year[-\s]?old|minderårig|barn|tonåring|\d{1,2}[-\s]?åring)\b/i;
      const SEXUAL = /\b(viol|pédophil|pedophil|paedophil|inceste|agression\s+sexuelle|abus\s+sexuel|pédopornograph|sextorsion|stupro|violenza\s+sessuale|abuso\s+sessuale|pedofilia|adescamento|pedopornografia|rape|raped|sexual\s+assault|sexual\s+abuse|molest|grooming|child\s+porn|csam|våldtäkt|sexbrott|sexuell\s+övergrepp|barnpornograf|sexköp)\b/i;
      if (!MINOR.test(text) || !SEXUAL.test(text)) return false;
      return /\b(mineur|enfant|adolescent|minor(?:e|enne|i)?|bambin|ragazzin|child(?:ren)?|kid|teen|underage|toddler|infant|baby|\d{1,2}[-\s]?year[-\s]?old|barn|tonåring|\d{1,2}[-\s]?åring)\b.{0,80}\b(viol|pédophil|pedophil|agression\s+sexuelle|stupro|violenza\s+sessuale|abuso\s+sessuale|pedofilia|rape|sexual\s+assault|sexual\s+abuse|molest|paedophil|grooming|child\s+porn|csam|våldtäkt|sexuell\s+övergrepp|barnpornograf)\b/i.test(text);
    },
  },
  {
    id: 'CHILD_SAFETY_02',
    reason: 'Missing/victim child with identifying detail (Meta CSEA)',
    pattern: /\b(disparition|enlèvement|kidnapp(?:é|ée)?|fugue|retrouv[ée]\s+mort|alerte\s+enlèvement|scomparsa|rapit[oa]|sequestro|trovat[oa]\s+mort|missing|abducted|kidnapp(?:ed|ing)|amber\s+alert|found\s+dead|named\s+as|försvunnen|kidnappad|bortröv(?:ad|at)|hittad[es]?\s+död)\b/i,
  },
  {
    id: 'SEX_VIOL_01',
    reason: 'Rape/sexual assault in headline (ABSOLUTE for new pages under 6 months)',
    pattern: /\b(viol\s+collectif|tournante|agression\s+sexuelle|tentative\s+de\s+viol|soumission\s+chimique|stupro\s+di\s+gruppo|violenza\s+di\s+gruppo|violentat[oa]|tentato\s+stupro|raped|gang[\s-]?rap(?:e|ed)|sexually\s+assaulted|attempted\s+rape|sex\s+attack|rape\s+victim|våldtagen|våldtäkt|gruppvåldtäkt|sexuellt\s+övergrepp|våldtäktsförsök)\b/i,
  },
];

// ─── POLICY — saved as status='blocked' with blocked_reason ───────────────────
const POLICY_RULES = [
  {
    id: 'HATE_SPEECH_01',
    reason: 'Replacement-theory cluster (Loi 1881 art. 24 + Meta Tier-1 hateful conduct)',
    pattern: /\b(grand\s+remplacement|remplacisme|grande\s+sostituzione|sostituzione\s+etnica|piano\s+kalergi|great\s+replacement|white\s+replacement|white\s+genocide|demographic\s+replacement|kalergi[\s-]?plan|ethnic\s+replacement|det\s+stora\s+utbytet|befolkningsutbyte|folkutbyte|kalergi[\s-]?planen)\b/i,
  },
  {
    id: 'HATE_SPEECH_02',
    reason: 'Religion + restriction combo (Meta Tier-2 hate — safe-harbor mandatory, HIGH false-positive)',
    pattern: /\b(islamiste|islamisation|sharia|islamist|islamiz(?:e|ation)|caliphate|no[\s-]?go\s+zone|islamisering|kalifat)\b.{0,40}\b(loi|interdiction|menace|danger|invasion|legge|divieto|minaccia|pericolo|law|ban|threat|conquest|lag|förbud|hot|fara)\b/i,
  },
  {
    id: 'VIOLENCE_INCIT_01',
    reason: 'Glorification of attack within 60 chars of attack lexicon (Code pénal 421-2-5)',
    pattern: /\b(héros|martyr|vengé|apologie|eroe|martire|vendicato|apologia|hero|avenged|glorif(?:y|ying)|hjälte|hämnd|förhärligar)\b.{0,60}\b(attentat|attaque|attacco|attentato|attack|terroris|assassinat|tuerie|strage|sparatoria|skjutning)\b/i,
  },
  {
    id: 'HARM_SUICIDE_01',
    reason: 'Method/location in headline or romanticisation (WHO media guidelines + Meta Suicide CS)',
    pattern: /\b(s'est\s+pendu|s'est\s+jeté|s'est\s+tiré|s'est\s+suicidé|overdose|saut\s+du|métro\s+suicide|lettre\s+d'adieu|si\s+è\s+impiccato|si\s+è\s+gettato|si\s+è\s+sparato|biglietto\s+d'addio|hang(?:ed|ing)|jumped\s+from|shot\s+himself|shot\s+herself|took\s+his\s+own\s+life|took\s+her\s+own\s+life|overdosed|slit\s+wrist|slit\s+throat|leapt\s+from|suicide\s+note|at\s+peace\s+now|hängde\s+sig|hoppade\s+från|sköt\s+sig|tog\s+sitt\s+liv|överdos|avskedsbrev)\b/i,
  },
  {
    id: 'HARM_EXTREMISM_01',
    reason: 'Martyrdom framing for violent actors (Meta DOI Tier 1)',
    pattern: /\b(martyr\s+de\s+la\s+cause|mort\s+en\s+héros|died\s+a\s+hero|sacrifice\s+glorieux|sacrificio\s+glorioso|glorious\s+sacrifice|frères\s+combattants|fratelli\s+combattenti|brother\s+fighters|caliphat\s+éternel|califfato\s+eterno|eternal\s+caliphate|evigt\s+kalifat)\b/i,
  },
  {
    id: 'FR_LEGAL_01',
    reason: 'French active-proceedings leak (Loi 1881 art. 35 ter + secret instruction)',
    pattern: /\b(mis(?:e)?\s+en\s+examen|garde\s+à\s+vue|inculpé(?:e)?|secret\s+de\s+l['']instruction|juge\s+d['']instruction|menotté(?:e)?|domicilié(?:e)?\s+à)\b/i,
  },
  {
    id: 'FR_LEGAL_02',
    reason: 'French hate speech (Loi Pleven / Loi 1881 art. 24)',
    pattern: /\b(sale\s+(?:arabe|juif|noir|musulman|blanc|asiatique|gitan)|tous\s+des\s+(?:voleurs|violeurs|terroristes|profiteurs)|retournez\s+chez\s+vous|racaille|bougnoule|youpin|nègre|bicot)\b/i,
  },
  {
    id: 'IT_LEGAL_01',
    reason: 'Italian diffamazione aggravata via social (Art. 595 c.p. — Cass. 30737/2019)',
    pattern: /\b(truffatore|ladro|corrotto|mafioso|pedofilo|criminale|delinquente|disonesto|imbroglione)\b/i,
  },
  {
    id: 'IT_LEGAL_02',
    reason: 'Italian organised crime — legal exposure + personal safety risk',
    pattern: /\b(cosa\s+nostra|camorra|['']?ndrangheta|sacra\s+corona\s+unita|capomafia|capo[\s-]?clan|boss\s+della)\b/i,
  },
  {
    id: 'AU_LEGAL_01',
    reason: 'Australian defamation — no public-figure defence (Defamation Act 2005 + Voller HCA)',
    pattern: /\b(fraudster|crook|corrupt|liar|cheat|scammer|paedo(?:phile)?|pedo(?:phile)?|accused\s+of|linked\s+to|caught\s+up\s+in)\b/i,
  },
  {
    id: 'AU_LEGAL_02',
    reason: 'Australian suppression order breach (fines up to AUD 550k + criminal contempt)',
    pattern: /\b(suppression\s+order|cannot\s+be\s+named|not\s+to\s+be\s+identified|name\s+suppressed|unnamed\s+accused|legal\s+reasons)\b/i,
  },
  {
    id: 'AU_LEGAL_03',
    reason: 'Australian s 18C racial vilification (RDA 1975 — Eatock v Bolt FCA 2011)',
    pattern: /\b(african\s+gang|ethnic\s+crime\s+wave|sudanese\s+gangs?|boat\s+people|queue[\s-]?jumper|indigenous\s+welfare\s+(?:cheat|rort|abuse))\b/i,
  },
  {
    id: 'SE_LEGAL_01',
    reason: 'Swedish hets mot folkgrupp (BrB 16:8 — Prop. 2023/24:93 in force 1 Jul 2024)',
    pattern: /\b(alla\s+(?:invandrare|muslimer|judar|romer|araber)\s+(?:är|borde|skall)|skickas\s+tillbaka|invandrare\s+våldtar|judarna\s+styr|förintelseförnekelse|rasen\s+ska|de\s+förstör\s+sverige|kalifat\s+sverige)\b/i,
  },
];

// ─── WARNING — blocked unless safe-harbor phrase is also present ──────────────
const WARNING_RULES = [
  {
    id: 'MISINFO_HEALTH_01',
    reason: 'Miracle-cure / anti-vax claim (Meta Misinformation + ARCOM — reach_suppression)',
    pattern: /\b(remède\s+miracle|guérit\s+le\s+cancer|cancer\s+guéri|ils\s+ne\s+veulent\s+pas|big\s+pharma\s+cache|vaccin\s+(?:tue|dangereux|mortel)|ivermectine|hydroxychloroquine|cura\s+miracolosa|guarisce\s+il\s+cancro|il\s+vaccino\s+uccide|vaccino\s+pericoloso|metodo\s+di\s+bella|miracle\s+cure|cures?\s+cancer|cancer\s+cured|they\s+don'?t\s+want\s+you\s+to\s+know|big\s+pharma\s+hides|vaccine\s+(?:kills|dangerous|deadly)|turbo\s+cancer|died\s+suddenly|mrna\s+cancer|mirakelkur|botar\s+cancer|vaccin\s+dödar|plötsligt\s+avliden)\b/i,
  },
  {
    id: 'HARM_FINANCE_01',
    reason: 'Investment fraud / guaranteed returns (AMF/CONSOB/ASIC/Finansinspektionen)',
    pattern: /\b(rendement\s+garanti|investissement\s+sans\s+risque|gains\s+garantis|crypto\s+révolutionnaire|placement\s+miracle|rendimento\s+garantito|investimento\s+senza\s+rischio|guaranteed\s+returns?|risk[\s-]?free\s+investment|earn\s+\$?\d+\s+a\s+day|revolutionary\s+crypto|financial\s+freedom\s+secret|passive\s+income\s+guaranteed|get\s+rich\s+quick|\d+x\s+your\s+money|garanterad\s+avkastning|riskfri\s+investering|bli\s+rik\s+snabbt)\b/i,
  },
  {
    id: 'ADULT_AD_01',
    reason: 'Adult content lexicon — blocks ad-boost only, not organic (Meta Advertising Standards)',
    pattern: /\b(sexy|nude|naked|seins|fesses|libido|orgasm[ei]?|masturbation|pornographie|escort|striptease|sextoy|fellation|seno|sedere|masturbazione|pornografia|spogliarello|boobs|porn(?:o|ography)?|sex\s+toy|condom|blowjob|naken|bröst|stjärt|onani|porr|eskort|sexleksak|kondom)\b/i,
  },
  {
    id: 'ADS_DRUGS_01',
    reason: 'Recreational/prescription drug reference — blocks ad-boost (Meta Restricted Goods)',
    pattern: /\b(cocaïne|coke|héroïne|cannabis|weed|ecstasy|mdma|kétamine|crack|crystal\s+meth|oxycodone|fentanyl|tramadol|xanax|lexomil|cocaina|eroina|ketamina|metanfetamina|ossicodone|spinello|cocaine|heroin|ketamine|adderall|vicodin|opioid|kokain|hasch|metamfetamin|oxikodon|knark|tjack)\b/i,
  },
  {
    id: 'ADS_WEAPONS_01',
    reason: 'Weapon + violence verb within 40 chars — ad-boost block (Meta Weapons Ads Policy)',
    pattern: /\b(arme|fusil|pistolet|couteau|machette|arma|fucile|pistola|coltello|machete|gun|rifle|pistol|knife|vapen|gevär|kniv)\b.{0,40}\b(tué|abattu|fusillade|tiré|blessé|ucciso|sparatoria|killed|shot|shooting|wounded|stabbed|dödad|sköts|skjutning|knivhuggen|sårad)\b|\b(fusillade|sparatoria|shooting|skjutning)\b/i,
  },
  {
    id: 'ADS_POLITICS_01',
    reason: 'Election/political phrasing — HARD boost-block in EU since Oct 2025 (TTPA + Meta)',
    pattern: /\b(élection|présidentielle|législative|candidat|Macron|Le\s+Pen|Mélenchon|gouvernement|scrutin|elezioni|candidato|Meloni|Schlein|Salvini|governo|prime\s+minister|Albanese|Dutton|Labor|Coalition|referendum|valet|Kristersson|Sverigedemokraterna|Moderaterna|Socialdemokraterna|regering)\b/i,
  },
  {
    id: 'AU_LEGAL_04',
    reason: 'Australian intimate image / privacy tort (statutory tort from June 2025)',
    pattern: /\b(home\s+address|phone\s+number\s+leaked|medical\s+records?\s+leaked|leaked\s+photos|without\s+consent|intimate\s+images|nude\s+photos\s+of)\b/i,
  },
  {
    id: 'SE_LEGAL_03',
    reason: 'Swedish IMY GDPR triggers — personal data in headline (IMY enforcement active)',
    pattern: /\b(personnummer|sjukhusjournal|hivsmittad|cancerdiagnos|hbtq[\s-]?person|dömd\s+för|adress\s+avslöjad)\b/i,
  },
];

// Rules that mark IT articles as boost-ineligible instead of hard-blocking (D3a decision)
const BOOST_INELIGIBLE_RULES = new Set(['ADS_POLITICS_01', 'ADS_WEAPONS_01', 'ADS_DRUGS_01']);

// ─── COMBINATION ESCALATIONS ──────────────────────────────────────────────────
const COMBINATION_RULES = [
  { id: 'COMBO_01', name: 'Drugs + Minor',           triggers: ['ADS_DRUGS_01', 'CHILD_SAFETY_01'], escalateTo: 'absolute' },
  { id: 'COMBO_02', name: 'Weapon + Religion-Group', triggers: ['ADS_WEAPONS_01', 'HATE_SPEECH_02'], escalateTo: 'absolute' },
  { id: 'COMBO_03', name: 'Suicide + Minor',         triggers: ['HARM_SUICIDE_01', 'CHILD_SAFETY_01'], escalateTo: 'absolute' },
  { id: 'COMBO_04', name: 'Replacement + Election',  triggers: ['HATE_SPEECH_01', 'ADS_POLITICS_01'], escalateTo: 'absolute' },
];

export function validateArticle(article) {
  const title   = (article.title   || '').toLowerCase();
  const summary = (article.summary || '').toLowerCase();
  const text    = `${title} ${summary}`;

  const hit = (rule) => (rule.test ? rule.test(text) : rule.pattern.test(text));

  // 1. ABSOLUTE — silent drop
  //    Exception: CHILD_SAFETY_01 + safe-harbor phrase → manual_review instead
  for (const rule of ABSOLUTE_RULES) {
    if (hit(rule)) {
      if (rule.id === 'CHILD_SAFETY_01' && SAFE_HARBOR.test(text)) {
        return { valid: false, reason: `${rule.id}: ${rule.reason}`, severity: 'manual_review' };
      }
      return { valid: false, reason: `${rule.id}: ${rule.reason}`, severity: 'absolute' };
    }
  }

  // 2. POLICY — save as blocked
  const triggeredIds = [];
  for (const rule of POLICY_RULES) {
    if (hit(rule)) {
      triggeredIds.push(rule.id);
      return { valid: false, reason: `${rule.id}: ${rule.reason}`, severity: 'policy' };
    }
  }

  // 3. WARNING — safe harbor allows article through (boost disabled)
  const hasSafeHarbor = SAFE_HARBOR.test(text);
  for (const rule of WARNING_RULES) {
    if (hit(rule)) {
      triggeredIds.push(rule.id);
      // IT-first: ad-boost rules mark as boost_ineligible instead of hard-blocking (D3a)
      if (BOOST_INELIGIBLE_RULES.has(rule.id) && article.country === 'IT') {
        return { valid: true, reason: `${rule.id}: ${rule.reason}`, boostEligible: false };
      }
      if (!hasSafeHarbor) {
        return { valid: false, reason: `${rule.id}: ${rule.reason}`, severity: 'warning' };
      }
      return { valid: true, reason: `${rule.id}: ${rule.reason}`, severity: 'warning', boostWarning: true };
    }
  }

  // 4. Combination escalation check
  for (const combo of COMBINATION_RULES) {
    if (combo.triggers.every(id => triggeredIds.includes(id))) {
      return { valid: false, reason: `${combo.id}: ${combo.name}`, severity: combo.escalateTo };
    }
  }

  return { valid: true, reason: null };
}
