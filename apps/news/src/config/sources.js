// Country and source configuration for the news pipeline.
// TODO: migrate from facebook-news-pipeline/src/config/sources.js

export const SOURCES = {
  FR: {
    rss: [
      { name: 'Le Monde', url: 'https://www.lemonde.fr/rss/une.xml' },
      // … migrate full list
    ],
    newsapi: { query: 'France actualités', language: 'fr' },
    captionLanguage: 'French',
    fbPageEnvKey: 'FR',
    pageName: 'France Aujourd\'hui',
    watermarkFile: 'FR_Logo.png',
  },
  IT: {
    rss: [
      { name: 'ANSA', url: 'https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml' },
      // … migrate full list
    ],
    newsapi: { query: 'Italia notizie', language: 'it' },
    captionLanguage: 'Italian',
    fbPageEnvKey: 'IT',
    pageName: 'Vivere in Italia',
    watermarkFile: 'IT_Logo.png',
  },
  // Add new countries here — no other code changes needed
};
