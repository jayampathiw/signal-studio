import { env } from '@signal-studio/config';
import { getClient } from '@signal-studio/database';
import { getPillarWeeklyCounts, updateArticle } from '@signal-studio/database/articles';
import { computePublishScore, computeEditorialScore } from '../enrich/publishScore.js';
import { SLOTS } from '../config/slots.js';
import { tagArticle } from '../enrich/tagArticle.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_KEY'];
const missing = REQUIRED_ENV.filter(k => !env[k]);
if (missing.length) {
  console.error(`RECOMPUTE-SCORES FAILED: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

async function run() {
  console.log(`[recompute-scores] Starting: ${new Date().toISOString()}`);

  const supabase = getClient();
  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .eq('status', 'pending');

  if (error) {
    console.error('Failed to fetch articles:', error.message);
    process.exit(1);
  }

  if (!articles?.length) {
    console.log('[recompute-scores] No pending articles to recompute');
    return;
  }

  const countriesInBatch = [...new Set(articles.map(a => a.country))];
  const weeklyCountsByCountry = {};
  for (const country of countriesInBatch) {
    weeklyCountsByCountry[country] = await getPillarWeeklyCounts(country);
  }

  let updated = 0;
  const errors = [];

  for (const article of articles) {
    const slots = SLOTS[article.country] ?? [];
    const weeklyCounts = weeklyCountsByCountry[article.country] ?? {};
    const publish_score   = computePublishScore(article, weeklyCounts, slots);
    const editorial_score = computeEditorialScore(article);
    const tags            = tagArticle(article);

    try {
      await updateArticle(article.id, { publish_score, editorial_score, tags });
      updated++;
    } catch (err) {
      errors.push({ id: article.id, error: err.message });
    }
  }

  console.log(`[recompute-scores] Updated ${updated}/${articles.length} articles`);
  if (errors.length > 0) {
    console.error(`[recompute-scores] Errors: ${errors.length}`);
    for (const e of errors) console.error(`  - ${e.id}: ${e.error}`);
  }

  console.log(`[recompute-scores] Done: ${new Date().toISOString()}`);
}

run().catch(err => {
  console.error('RECOMPUTE-SCORES FAILED:', err);
  process.exit(1);
});
