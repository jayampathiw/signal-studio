import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { classifyArticle } from '../enrich/criticality.js';
import { validateArticle } from '../validators/contentValidator.js';
import { similarity } from '../enrich/dedup.js';
import { computeEditorialScore } from '../enrich/publishScore.js';

const FB_BASE = 'https://graph.facebook.com/v22.0';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const COMPETITOR_PAGES = {
  FR: [
    { name: 'BFM TV',          slug: 'BFMTV' },
    { name: 'France Info',     slug: 'franceinfo' },
    { name: 'Le Monde',        slug: 'lemonde.fr' },
    { name: 'Le Figaro',       slug: 'lefigaro' },
    { name: '20 Minutes',      slug: '20minutes' },
    { name: 'France 24',       slug: 'france24' },
    { name: "L'Obs",           slug: 'lenouvelobservateur' },
    { name: 'Libération',      slug: 'liberation.fr' },
    { name: 'LCI',             slug: 'LCI' },
    { name: 'CNews',           slug: 'CNEWS' },
    { name: 'Huffpost France', slug: 'huffpostfrance' },
    { name: 'Konbini News',    slug: 'konbininews' },
  ],
  IT: [
    { name: 'ANSA',                slug: 'ansa.it' },
    { name: 'Corriere della Sera', slug: 'corriere' },
    { name: 'La Repubblica',       slug: 'larepubblica' },
    { name: 'La Stampa',           slug: 'lastampa' },
    { name: 'Il Fatto Quotidiano', slug: 'ilfattoquotidiano' },
    { name: 'TGcom24',             slug: 'tgcom24' },
    { name: 'Sky TG24',            slug: 'skytg24' },
    { name: 'Fanpage',             slug: 'fanpage.it' },
    { name: 'Open',                slug: 'open.online' },
    { name: 'Il Post',             slug: 'ilpost' },
  ],
};

async function fetchPagePosts(slug, token) {
  const since = Math.floor((Date.now() - 48 * 60 * 60 * 1000) / 1000);
  const fields = [
    'id', 'message', 'story', 'created_time', 'full_picture',
    'attachments{title,description,url,media}',
    'reactions.summary(total_count)',
    'comments.summary(total_count)',
    'shares',
  ].join(',');

  const res = await axios.get(`${FB_BASE}/${slug}/posts`, {
    params: { fields, limit: 20, since, access_token: token },
    timeout: 20000,
  });
  return res.data.data ?? [];
}

function engagementScore(post) {
  const reactions = post.reactions?.summary?.total_count ?? 0;
  const comments  = post.comments?.summary?.total_count ?? 0;
  const shares    = post.shares?.count ?? 0;
  return reactions + comments + (shares * 2);
}

function extractAttachmentUrl(post) {
  const attachment = post.attachments?.data?.[0];
  if (!attachment) return null;
  const url = attachment.url || attachment.media?.source;
  if (!url) return null;
  if (/^https?:\/\/(www\.)?facebook\.com/.test(url)) return null;
  return url;
}

function extractTitle(post) {
  const attachment = post.attachments?.data?.[0];
  if (attachment?.title) return attachment.title;
  const msg = post.message || post.story || '';
  return msg.split('\n')[0].slice(0, 200) || null;
}

function extractSnippet(post) {
  const attachment = post.attachments?.data?.[0];
  if (attachment?.description) return attachment.description.slice(0, 500);
  const msg = post.message || '';
  return msg.slice(0, 500) || null;
}

async function getRecentArticles(country) {
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
    if (article.original_url && existing.original_url === article.original_url) return true;
    if (existing.title && article.title && similarity(existing.title, article.title) > 0.7) return true;
  }
  return false;
}

async function run() {
  console.log(`[trending-pages] Starting: ${new Date().toISOString()}`);

  let totalSignals = 0;
  let totalArticles = 0;

  for (const [country, pages] of Object.entries(COMPETITOR_PAGES)) {
    const token = process.env[`FB_ACCESS_TOKEN_${country}`];
    if (!token) {
      console.warn(`[${country}] No FB_ACCESS_TOKEN_${country} — skipping`);
      continue;
    }

    console.log(`\n[${country}] Scanning ${pages.length} competitor pages…`);

    const allPosts = [];

    for (const page of pages) {
      try {
        const posts = await fetchPagePosts(page.slug, token);
        const ranked = posts
          .map(p => ({ ...p, _page: page.name, _score: engagementScore(p) }))
          .sort((a, b) => b._score - a._score)
          .slice(0, 3);
        allPosts.push(...ranked);
        console.log(`  ✓ ${page.name}: ${posts.length} posts fetched, top score=${ranked[0]?._score ?? 0}`);
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.error?.message || err.message;
        console.warn(`  ✗ ${page.name} (${page.slug}): ${status ?? ''} ${msg}`);
      }
    }

    if (!allPosts.length) {
      console.log(`[${country}] No posts fetched`);
      continue;
    }

    const top = allPosts.sort((a, b) => b._score - a._score).slice(0, 15);

    console.log(`[${country}] Top ${top.length} posts by engagement:`);
    top.forEach((p, i) => {
      const title = extractTitle(p)?.slice(0, 60) ?? '(no title)';
      console.log(`  ${i + 1}. [${p._page}] score=${p._score} "${title}"`);
    });

    const signals = top.map(p => ({
      country,
      signal_type:      'fb_page',
      query:            p._page,
      source_page:      p._page,
      title:            extractTitle(p) ?? '(no title)',
      snippet:          extractSnippet(p),
      url:              extractAttachmentUrl(p),
      engagement_total: p._score,
    }));

    const { error: sigErr } = await supabase.from('trending_signals').insert(signals);
    if (sigErr) console.error(`[${country}] Signal insert error: ${sigErr.message}`);
    else totalSignals += signals.length;

    const recentArticles = await getRecentArticles(country);
    let saved = 0;

    for (const post of top) {
      const url = extractAttachmentUrl(post);
      if (!url) continue;

      const title = extractTitle(post);
      if (!title) continue;

      const article = {
        country,
        source:       post._page,
        title,
        original_url: url,
        summary:      extractSnippet(post) || '',
        published_at: new Date(post.created_time).toISOString(),
      };

      if (isDuplicate(article, recentArticles)) continue;

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
        recentArticles.push({ original_url: url, title });
      } else if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
        console.error(`  DB error: ${error.message}`);
      }
    }

    console.log(`[${country}] ${saved} new articles added from trending pages`);
    totalArticles += saved;
  }

  console.log(`\n[trending-pages] Done — ${totalSignals} signals stored, ${totalArticles} articles added`);
}

run().catch(err => {
  console.error('TRENDING-PAGES FAILED:', err);
  process.exit(1);
});
