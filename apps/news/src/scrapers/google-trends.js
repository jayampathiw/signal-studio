import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { classifyArticle } from '../enrich/criticality.js';
import { validateArticle } from '../validators/contentValidator.js';
import { deduplicate, similarity } from '../enrich/dedup.js';
import { computeEditorialScore } from '../enrich/publishScore.js';

const TRENDS_RSS = {
  FR: 'https://trends.google.com/trending/rss?geo=FR',
  IT: 'https://trends.google.com/trending/rss?geo=IT',
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').trim() || null;
}

function parseTrendingItems(xml) {
  const items = [];
  for (const [, itemXml] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const query = extractTag(itemXml, 'title');
    if (!query) continue;

    const newsItems = [];
    for (const [, niXml] of itemXml.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)) {
      const title   = extractTag(niXml, 'ht:news_item_title');
      const snippet = extractTag(niXml, 'ht:news_item_snippet');
      const url     = extractTag(niXml, 'ht:news_item_url');
      const source  = extractTag(niXml, 'ht:news_item_source');
      if (title && url) newsItems.push({ title, snippet, url, source });
    }

    if (newsItems.length > 0) items.push({ query, newsItems });
  }
  return items;
}

async function getRecentUrls(country) {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('articles')
    .select('original_url, title')
    .eq('country', country)
    .gte('created_at', since);
  return data ?? [];
}

function isDuplicate(article, recentArticles) {
  for (const existing of recentArticles) {
    if (existing.original_url === article.original_url) return true;
    if (existing.title && similarity(existing.title, article.title) > 0.7) return true;
  }
  return false;
}

async function run() {
  console.log(`[google-trends] Starting: ${new Date().toISOString()}`);

  let totalSaved = 0;
  let totalSignals = 0;

  for (const [country, rssUrl] of Object.entries(TRENDS_RSS)) {
    console.log(`\n[${country}] Fetching Google Trends RSS…`);

    let xml;
    try {
      const res = await axios.get(rssUrl, { timeout: 20000 });
      xml = res.data;
    } catch (err) {
      console.error(`[${country}] RSS fetch failed: ${err.message}`);
      continue;
    }

    const trendingItems = parseTrendingItems(xml);
    console.log(`[${country}] ${trendingItems.length} trending queries found`);

    if (!trendingItems.length) continue;

    const recentArticles = await getRecentUrls(country);

    const candidates = [];
    const signals = [];

    for (const { query, newsItems } of trendingItems) {
      for (const ni of newsItems) {
        const article = {
          country,
          source:       `Google Trends — ${ni.source || query}`,
          title:        ni.title,
          original_url: ni.url,
          summary:      ni.snippet || '',
          published_at: new Date().toISOString(),
        };

        signals.push({
          country,
          signal_type: 'google_trends',
          query,
          source_page: ni.source,
          title:       ni.title,
          snippet:     ni.snippet,
          url:         ni.url,
        });

        if (!isDuplicate(article, recentArticles)) {
          candidates.push(article);
        }
      }
    }

    if (signals.length) {
      const { error } = await supabase.from('trending_signals').insert(signals);
      if (error) console.error(`[${country}] Signal insert error: ${error.message}`);
      else {
        totalSignals += signals.length;
        console.log(`[${country}] Saved ${signals.length} trending signals`);
      }
    }

    const deduped = deduplicate(candidates);

    let saved = 0;
    for (const article of deduped) {
      const { criticality, priority_score } = classifyArticle(article);
      const check = validateArticle(article);

      if (check.severity === 'absolute' || check.severity === 'manual_review') continue;

      const editorial_score = computeEditorialScore({ ...article, priority_score, created_at: new Date().toISOString() });
      const row = {
        ...article,
        criticality,
        priority_score,
        editorial_score,
        status:        check.valid ? 'pending' : 'blocked',
        boost_eligible: check.boostEligible !== false,
      };
      if (!check.valid && check.reason) row.blocked_reason = check.reason;

      const { error } = await supabase.from('articles').insert(row);
      if (!error) {
        saved++;
      } else if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
        console.error(`  DB error: ${error.message}`);
      }
    }

    console.log(`[${country}] ${saved}/${deduped.length} new articles saved from Google Trends`);
    totalSaved += saved;
  }

  console.log(`\n[google-trends] Done — ${totalSaved} articles saved, ${totalSignals} signals stored`);
}

run().catch(err => {
  console.error('GOOGLE-TRENDS FAILED:', err);
  process.exit(1);
});
