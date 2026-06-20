import axios from 'axios';
import { env } from '@content-platform/config';

export async function fetchNewsAPI(query, language, country) {
  if (!env.NEWSAPI_KEY) {
    console.warn('  ⚠ NewsAPI key not set, skipping');
    return [];
  }

  try {
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: query,
        language,
        sortBy: 'publishedAt',
        pageSize: 10,
        apiKey: env.NEWSAPI_KEY,
      },
    });

    const articles = response.data.articles
      .filter(a => a.title && a.url && a.title !== '[Removed]')
      .map(a => ({
        country,
        source: a.source.name,
        title: a.title,
        original_url: a.url,
        summary: a.description,
        published_at: new Date(a.publishedAt).toISOString(),
      }));

    console.log(`  ✓ NewsAPI (${language}): ${articles.length} articles`);
    return articles;
  } catch (err) {
    console.error(`  ✗ NewsAPI (${language}): ${err.message}`);
    return [];
  }
}
