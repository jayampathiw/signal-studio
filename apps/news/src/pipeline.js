import { env } from '@signal-studio/config';
import {
  saveArticles,
  getRecentArticleTitles,
  getRecentArticlesForClustering,
} from '@signal-studio/database/articles';

import { SOURCES } from './config/sources.js';
import { deduplicate, similarity, detectAndAnnotateClusters } from './enrich/dedup.js';
import { fetchNewsAPI } from './ingestion/newsapi.js';
import { fetchRSSFeeds } from './ingestion/rss.js';
import { validateArticle } from './validators/contentValidator.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_KEY'];
const missing = REQUIRED_ENV.filter((k) => !env[k]);
if (missing.length) {
  console.error(`PIPELINE FAILED: Missing required environment variables: ${missing.join(', ')}`);
  console.error(
    'Set these as GitHub Actions Secrets under Settings → Secrets and variables → Actions',
  );
  process.exit(1);
}

process.on('unhandledRejection', (err) => {
  console.error('PIPELINE FAILED:', err);
  process.exit(1);
});

async function processCountry(country, config) {
  console.log(`\n📰 Processing: ${country} (${config.pageName})`);

  const [rssArticles, apiArticles] = await Promise.all([
    fetchRSSFeeds(config.rss, country),
    fetchNewsAPI(config.newsapi.query, config.newsapi.language, country),
  ]);

  const raw = deduplicate([...rssArticles, ...apiArticles]);
  console.log(
    `  Fetched: ${rssArticles.length + apiArticles.length} total → ${raw.length} after in-batch dedup`,
  );

  const recentTitles = await getRecentArticleTitles(country);
  const unique = raw.filter((article) => {
    const tooSimilar = recentTitles.some((t) => similarity(article.title, t) > 0.7);
    if (tooSimilar) console.log(`  ↩ Already in DB: "${article.title}"`);
    return !tooSimilar;
  });
  console.log(`  After DB dedup: ${unique.length} new articles`);

  const validated = [];
  const blocked = [];

  for (const article of unique) {
    const check = validateArticle(article);

    if (check.valid) {
      validated.push({
        ...article,
        ...(check.boostWarning && { boost_warning: true }),
        ...(check.boostEligible === false && { boost_eligible: false }),
      });
    } else if (check.severity === 'absolute') {
      console.log(`  ⛔ Dropped (absolute): "${article.title}"`);
    } else {
      const status = check.severity === 'manual_review' ? 'manual_review' : 'blocked';
      blocked.push({ ...article, status, blocked_reason: check.reason });
      console.log(`  ⛔ ${status}: "${article.title}" — ${check.reason}`);
    }
  }

  const recentForClustering = await getRecentArticlesForClustering(country);
  detectAndAnnotateClusters(validated, recentForClustering);
  const clustered = validated.filter((a) => a.cluster_size >= 2);
  if (clustered.length > 0) {
    console.log(
      `  Clusters detected: ${clustered.length} articles in ${new Set(clustered.map((a) => a.cluster_id)).size} cluster(s)`,
    );
  }

  const saved = await saveArticles(validated);
  console.log(`  Saved: ${saved} new articles (duplicates skipped silently)`);

  if (blocked.length > 0) {
    await saveArticles(blocked);
    console.log(`  Blocked/review: ${blocked.length} articles`);
  }
}

async function run() {
  console.log('🚀 Pipeline started:', new Date().toISOString());

  for (const [country, config] of Object.entries(SOURCES)) {
    await processCountry(country, config);
  }

  console.log('\n✅ Pipeline complete:', new Date().toISOString());
}

run();
