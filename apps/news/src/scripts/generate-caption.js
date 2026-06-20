import { getArticleById, updateArticle, getRecentSeedComments, getPillarWeeklyCounts } from '@content-platform/database/articles';
import { generateCaption, generateImagePrompt, formatImagePrompt, generateSEOContent } from '../services/ai.js';
import { SOURCES } from '../config/sources.js';
import { computePublishScore } from '../enrich/publishScore.js';
import { SLOTS } from '../config/slots.js';

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('Usage: node apps/news/src/scripts/generate-caption.js <id1> <id2> ...');
  process.exit(1);
}

let processed = 0;
let firstResult = null;

for (const id of ids) {
  try {
    const article = await getArticleById(id);
    if (!article) {
      console.error(`Article not found: ${id}`);
      continue;
    }

    const config = SOURCES[article.country];
    if (!config) {
      console.error(`Unknown country for article ${id}: ${article.country}`);
      continue;
    }

    const recentSeedIds = await getRecentSeedComments(article.country);
    const [caption, imageResult, seoContent] = await Promise.all([
      generateCaption(article, config.captionLanguage, config.pageName, config.pageHashtag, recentSeedIds),
      generateImagePrompt(article, config.captionLanguage),
      generateSEOContent(article, config.captionLanguage),
    ]);

    const pillar = caption.content_signals?.pillar_hint ?? null;
    const mergedSignals = {
      ...(caption.content_signals ?? {}),
      ...(caption.identity_mode ? { identity_mode: caption.identity_mode } : {}),
    };
    const weeklyPillarCounts = await getPillarWeeklyCounts(article.country);
    const updatedArticle = { ...article, pillar, content_signals: mergedSignals };
    const publish_score = computePublishScore(updatedArticle, weeklyPillarCounts, SLOTS[article.country] ?? []);

    await updateArticle(id, {
      ai_caption: { intro: caption.intro, question: caption.question, cta: caption.cta },
      hashtags: caption.hashtags ?? [],
      seed_comment: caption.seed_comment ?? null,
      seed_comment_template_id: caption.seed_comment_template_id ?? null,
      story_category: caption.story_category ?? null,
      content_signals: mergedSignals,
      image_headline: imageResult.imageHeadline,
      image_prompt: imageResult.prompt,
      formatted_image_prompt: formatImagePrompt(imageResult.prompt, imageResult.imageHeadline, config.watermarkFile),
      seo_title: seoContent.seo_title,
      seo_description: seoContent.seo_description,
      pillar,
      publish_score,
    });

    processed++;
    if (!firstResult) firstResult = { id, caption, imageResult, seoContent };
    console.log(`  ✓ ${id}: "${article.title.slice(0, 60)}"`);
  } catch (err) {
    console.error(`  ✗ ${id}: ${err.message}`);
  }
}

console.log(`\nGenerated for ${processed}/${ids.length} articles`);

if (firstResult) {
  console.log('\nSample result:');
  console.log(`  seo_title: ${firstResult.seoContent.seo_title}`);
  console.log(`  image_headline: ${firstResult.imageResult.imageHeadline}`);
  console.log(`  story_category: ${firstResult.caption.story_category}`);
  console.log(`  intro preview: ${firstResult.caption.intro?.slice(0, 100)}...`);
}
