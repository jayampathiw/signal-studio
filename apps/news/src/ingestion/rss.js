import Parser from 'rss-parser';

const parser = new Parser();

export async function fetchRSSFeeds(sources, country) {
  const results = [];

  for (const source of sources) {
    try {
      const feed = await parser.parseURL(source.url);

      const articles = feed.items
        .slice(0, 5)
        .map(item => ({
          country,
          source: source.name,
          title: item.title?.trim(),
          original_url: item.link,
          summary: item.contentSnippet || item.summary || item.content || null,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        }))
        .filter(a => a.title && a.original_url);

      results.push(...articles);
      console.log(`  ✓ ${source.name}: ${articles.length} articles`);
    } catch (err) {
      console.error(`  ✗ ${source.name}: ${err.message}`);
    }
  }

  return results;
}
