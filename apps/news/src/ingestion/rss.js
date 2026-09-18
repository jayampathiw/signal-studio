import Parser from 'rss-parser';

const parser = new Parser();
const RSS_TIMEOUT_MS = 10_000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

async function fetchOne(source, country) {
  try {
    const feed = await withTimeout(parser.parseURL(source.url), RSS_TIMEOUT_MS, source.name);
    const articles = feed.items
      .slice(0, 5)
      .map((item) => ({
        country,
        source: source.name,
        title: item.title?.trim(),
        original_url: item.link,
        summary: item.contentSnippet || item.summary || item.content || null,
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
      }))
      .filter((a) => a.title && a.original_url);
    console.log(`  ✓ ${source.name}: ${articles.length} articles`);
    return articles;
  } catch (err) {
    console.error(`  ✗ ${source.name}: ${err.message}`);
    return [];
  }
}

export async function fetchRSSFeeds(sources, country) {
  const batches = await Promise.all(sources.map((s) => fetchOne(s, country)));
  return batches.flat();
}
