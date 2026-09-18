// Curated backlog of evergreen historical-pride topics, distinct from the daily
// RSS/NewsAPI news pipeline. Each topic feeds the same caption + image flow as a
// regular article, but with identity_mode forced (no classifier) and a
// celebratory hook structure instead of news-wire framing.
//
// Selection rules:
// - Sport, science, art, food, exploration, culture only — no political figures,
//   no living-memory leaders, no religion/war framing.
// - anniversary_date is "MM-DD". Topics without a date are evergreen and used
//   when no anniversary is within range.
// - forced_mode locks the identity lens: ORGOGLIO/FIERTÉ for achievement wins,
//   PATRIMONIO/PATRIMOINE for heritage/cultural icons.

export const HISTORICAL_STORIES = [
  // ─────────── ITALY ───────────
  {
    id: 'it-2006-mondiale-berlino',
    country: 'IT',
    title: "Berlino 2006: l'Italia campione del mondo",
    brief:
      "Il 9 luglio 2006, allo Stadio Olimpico di Berlino, l'Italia conquista il suo quarto titolo mondiale battendo la Francia ai rigori. La squadra di Marcello Lippi — Buffon, Cannavaro, Pirlo, Materazzi, Grosso — entra nella leggenda dopo una notte di tensione, talento e nervi d'acciaio.",
    category: 'sport',
    forced_mode: 'ORGOGLIO',
    anniversary_date: '07-09',
  },
  {
    id: 'it-ferrari-prima-vittoria-f1-1951',
    country: 'IT',
    title: 'Silverstone 1951: la prima vittoria della Ferrari in Formula 1',
    brief:
      "Il 14 luglio 1951, al Gran Premio di Gran Bretagna a Silverstone, José Froilán González porta la Ferrari 375 alla sua prima vittoria in Formula 1. Da quel giorno il Cavallino Rampante diventa il simbolo dell'eccellenza italiana nello sport motoristico mondiale.",
    category: 'sport',
    forced_mode: 'ORGOGLIO',
    anniversary_date: '07-14',
  },
  {
    id: 'it-marco-polo-ritorno-1295',
    country: 'IT',
    title: "Il ritorno di Marco Polo: l'Italia che ha scoperto l'Oriente",
    brief:
      'Nel 1295 Marco Polo torna a Venezia dopo ventiquattro anni di viaggi attraverso l\'Asia, alla corte di Kublai Khan. Il suo "Milione" diventerà uno dei libri più letti del Medioevo, aprendo l\'Europa al mondo orientale e ispirando generazioni di esploratori.',
    category: 'exploration',
    forced_mode: 'PATRIMONIO',
    anniversary_date: null,
  },
  {
    id: 'it-marconi-segnale-transatlantico-1901',
    country: 'IT',
    title: "12 dicembre 1901: Marconi attraversa l'Atlantico con un segnale radio",
    brief:
      'Il 12 dicembre 1901 Guglielmo Marconi riceve a Terranova il primo segnale radio trasmesso da Poldhu in Cornovaglia — oltre 3.500 chilometri di oceano. È la nascita delle telecomunicazioni moderne, frutto del genio di un italiano che ha cambiato la storia della comunicazione.',
    category: 'science',
    forced_mode: 'ORGOGLIO',
    anniversary_date: '12-12',
  },
  {
    id: 'it-galileo-telescopio-1609',
    country: 'IT',
    title: '25 agosto 1609: Galileo presenta il telescopio al Senato di Venezia',
    brief:
      "Il 25 agosto 1609 Galileo Galilei mostra ai dogi di Venezia il suo cannocchiale, il primo strumento ottico capace di osservare le stelle. Pochi mesi dopo scoprirà le lune di Giove e cambierà per sempre la visione dell'universo. La scienza moderna nasce in Italia.",
    category: 'science',
    forced_mode: 'PATRIMONIO',
    anniversary_date: '08-25',
  },
  {
    id: 'it-pizza-margherita-1889',
    country: 'IT',
    title: 'Napoli 1889: nasce la pizza Margherita',
    brief:
      "Nel giugno 1889 il pizzaiolo napoletano Raffaele Esposito prepara per la regina Margherita di Savoia una pizza con pomodoro, mozzarella e basilico — i colori della bandiera italiana. È l'atto di nascita del piatto più amato al mondo, oggi patrimonio UNESCO dell'umanità.",
    category: 'food',
    forced_mode: 'PATRIMONIO',
    anniversary_date: '06-11',
  },
  {
    id: 'it-espresso-bezzera-1901',
    country: 'IT',
    title: "1901: a Milano nasce l'espresso italiano",
    brief:
      'Il 19 settembre 1901 Luigi Bezzera deposita a Milano il brevetto della prima macchina per il caffè espresso. Da quel momento il rito del caffè cambia per sempre: rapido, intenso, perfetto. Un piccolo gesto quotidiano che ha conquistato bar e cucine di tutto il pianeta.',
    category: 'food',
    forced_mode: 'PATRIMONIO',
    anniversary_date: '09-19',
  },
  {
    id: 'it-cappella-sistina-1512',
    country: 'IT',
    title: '31 ottobre 1512: Michelangelo finisce la Cappella Sistina',
    brief:
      "Dopo quattro anni di lavoro solitario sospeso a venti metri d'altezza, il 31 ottobre 1512 Michelangelo Buonarroti completa la volta della Cappella Sistina. Oltre trecento figure dipinte a fresco — Adamo, i profeti, le sibille — restano il vertice assoluto dell'arte universale.",
    category: 'art',
    forced_mode: 'PATRIMONIO',
    anniversary_date: '10-31',
  },
  {
    id: 'it-ultima-cena-leonardo-1498',
    country: 'IT',
    title: "Milano 1498: Leonardo termina L'Ultima Cena",
    brief:
      "Nel 1498, dopo tre anni di lavoro nel refettorio di Santa Maria delle Grazie a Milano, Leonardo da Vinci completa L'Ultima Cena. Un istante drammatico fissato per sempre sul muro — il momento in cui Cristo annuncia il tradimento. Cinque secoli dopo continua a parlarci come il primo giorno.",
    category: 'art',
    forced_mode: 'PATRIMONIO',
    anniversary_date: null,
  },
  {
    id: 'it-vespa-piaggio-1946',
    country: 'IT',
    title: "23 aprile 1946: nasce la Vespa, l'Italia su due ruote",
    brief:
      "Il 23 aprile 1946 a Pontedera, Enrico Piaggio brevetta la Vespa MP6 — primo scooter pensato per ricostruire l'Italia del dopoguerra. Linee morbide, motore protetto, accessibile a tutti. Diventerà in pochi anni il simbolo mondiale dello stile italiano: oltre 19 milioni di Vespe vendute in oltre 100 paesi.",
    category: 'culture',
    forced_mode: 'PATRIMONIO',
    anniversary_date: '04-23',
  },

  // ─────────── FRANCE ───────────
  {
    id: 'fr-coupe-monde-1998-zidane',
    country: 'FR',
    title: '12 juillet 1998 : la France championne du monde au Stade de France',
    brief:
      "Le 12 juillet 1998, au Stade de France, l'équipe d'Aimé Jacquet remporte la première Coupe du Monde de son histoire en battant le Brésil 3 à 0. Deux têtes de Zinédine Zidane, un peuple uni dans la liesse — la nuit où la France a découvert qu'elle pouvait gagner ensemble.",
    category: 'sport',
    forced_mode: 'FIERTÉ',
    anniversary_date: '07-12',
  },
  {
    id: 'fr-premier-tour-de-france-1903',
    country: 'FR',
    title: "1er juillet 1903 : le premier Tour de France s'élance",
    brief:
      "Le 1er juillet 1903, soixante coureurs partent du Café Réveil-Matin à Montgeron pour la première édition du Tour de France. Maurice Garin remportera l'épreuve après six étapes et 2 428 kilomètres. Une aventure populaire née il y a plus d'un siècle, devenue le plus grand événement cycliste du monde.",
    category: 'sport',
    forced_mode: 'PATRIMOINE',
    anniversary_date: '07-01',
  },
  {
    id: 'fr-pasteur-vaccin-rage-1885',
    country: 'FR',
    title: '6 juillet 1885 : Pasteur sauve le premier enfant de la rage',
    brief:
      "Le 6 juillet 1885, Louis Pasteur inocule pour la première fois son vaccin antirabique au jeune Joseph Meister, mordu par un chien enragé. L'enfant survit. La médecine moderne vient de naître à Paris, et avec elle l'idée que la science peut vaincre les maladies les plus terribles.",
    category: 'science',
    forced_mode: 'FIERTÉ',
    anniversary_date: '07-06',
  },
  {
    id: 'fr-marie-curie-nobel-1903',
    country: 'FR',
    title: '10 décembre 1903 : Marie Curie, première femme Prix Nobel',
    brief:
      "Le 10 décembre 1903, Marie Curie reçoit le Prix Nobel de physique pour ses travaux sur la radioactivité — première femme de l'histoire à recevoir cette distinction. Elle en recevra un second en chimie en 1911. Une vie consacrée à la science dans un laboratoire parisien, un héritage qui éclaire encore le monde.",
    category: 'science',
    forced_mode: 'FIERTÉ',
    anniversary_date: '12-10',
  },
  {
    id: 'fr-lumiere-premier-cinema-1895',
    country: 'FR',
    title: '28 décembre 1895 : les frères Lumière inventent le cinéma',
    brief:
      "Le 28 décembre 1895, dans le sous-sol du Grand Café boulevard des Capucines à Paris, Auguste et Louis Lumière organisent la première projection publique et payante de l'histoire du cinéma. Trente-trois spectateurs découvrent un train entrant en gare. Le septième art est né — en France.",
    category: 'culture',
    forced_mode: 'PATRIMOINE',
    anniversary_date: '12-28',
  },
  {
    id: 'fr-tour-eiffel-1889',
    country: 'FR',
    title: "31 mars 1889 : la Tour Eiffel s'élève sur Paris",
    brief:
      "Le 31 mars 1889, Gustave Eiffel hisse le drapeau tricolore au sommet de sa tour de fer pour l'Exposition universelle. 300 mètres, deux ans de chantier, et déjà la silhouette d'une nation. Décriée à sa naissance par les artistes, elle est aujourd'hui le monument le plus visité au monde — l'âme verticale de Paris.",
    category: 'culture',
    forced_mode: 'PATRIMOINE',
    anniversary_date: '03-31',
  },
  {
    id: 'fr-chanel-numero-5-1921',
    country: 'FR',
    title: '5 mai 1921 : Coco Chanel lance le N°5',
    brief:
      "Le 5 mai 1921, Gabrielle « Coco » Chanel présente le parfum N°5 — première fragrance moderne basée sur les aldéhydes synthétiques, créée avec Ernest Beaux. Un flacon sobre, un numéro à la place d'un nom, l'audace d'une femme libre. Le parfum le plus vendu du XXe siècle est français.",
    category: 'culture',
    forced_mode: 'PATRIMOINE',
    anniversary_date: '05-05',
  },
  {
    id: 'fr-premiere-exposition-impressionniste-1874',
    country: 'FR',
    title: '15 avril 1874 : la première exposition impressionniste',
    brief:
      'Le 15 avril 1874, boulevard des Capucines à Paris, Monet, Renoir, Degas, Pissarro, Sisley, Cézanne et Berthe Morisot exposent ensemble — rejetés par le Salon officiel. Un critique se moque du tableau « Impression, soleil levant ». Le nom restera. La peinture moderne vient de naître à Paris.',
    category: 'art',
    forced_mode: 'PATRIMOINE',
    anniversary_date: '04-15',
  },
  {
    id: 'fr-guide-michelin-1900',
    country: 'FR',
    title: '1900 : le premier Guide Michelin paraît',
    brief:
      "En 1900, les frères André et Édouard Michelin publient un petit guide rouge offert avec leurs pneumatiques pour encourager les automobilistes à voyager. 35 000 exemplaires, des cartes, des adresses d'hôtels et de restaurants. Plus d'un siècle plus tard, l'étoile Michelin reste la plus haute distinction de la gastronomie mondiale.",
    category: 'food',
    forced_mode: 'PATRIMOINE',
    anniversary_date: null,
  },
  {
    id: 'fr-festival-cannes-1946',
    country: 'FR',
    title: '20 septembre 1946 : la première édition du Festival de Cannes',
    brief:
      "Le 20 septembre 1946, sur la Croisette, s'ouvre la toute première édition du Festival de Cannes. Onze films primés ex æquo, parmi lesquels La Symphonie pastorale et Brève rencontre. Né d'un projet d'avant-guerre, le festival deviendra le plus prestigieux rendez-vous du cinéma mondial — et un symbole de l'élégance française.",
    category: 'culture',
    forced_mode: 'PATRIMOINE',
    anniversary_date: '09-20',
  },
];

// Source attribution shown in the Facebook post's 📰 Source(s) line for historical articles.
export const HISTORICAL_SOURCE_BY_COUNTRY = {
  IT: "Storia d'Italia",
  FR: 'Histoire de France',
};

export function getTopicById(id) {
  return HISTORICAL_STORIES.find((t) => t.id === id) ?? null;
}

export function getTopicsByCountry(country) {
  return HISTORICAL_STORIES.filter((t) => t.country === country);
}
