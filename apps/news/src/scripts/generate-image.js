import { getArticleById, updateArticle } from '@content-platform/database/articles';
import { generateImagePrompt, formatImagePrompt } from '../services/ai.js';
import { SOURCES } from '../config/sources.js';

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('Usage: node apps/news/src/scripts/generate-image.js <id1> <id2> ...');
  process.exit(1);
}

let processed = 0;

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

    const imageResult = await generateImagePrompt(article, config.captionLanguage);
    const formatted = formatImagePrompt(imageResult.prompt, imageResult.imageHeadline, config.watermarkFile);

    await updateArticle(id, {
      image_prompt: imageResult.prompt,
      image_headline: imageResult.imageHeadline,
      formatted_image_prompt: formatted,
    });

    processed++;
    console.log(`\n✓ ${id}: "${article.title.slice(0, 60)}"\n`);
    console.log(formatted);
    console.log('\n' + '─'.repeat(60));
  } catch (err) {
    console.error(`  ✗ ${id}: ${err.message}`);
  }
}

console.log(`\nGenerated image prompts for ${processed}/${ids.length} articles`);
