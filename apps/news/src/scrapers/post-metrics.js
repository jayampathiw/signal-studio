import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const FB_BASE = 'https://graph.facebook.com/v22.0';
const MAX_AGE_HOURS = 8 * 24;

let _supabase = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  return _supabase;
}

function ageHours(postedAt) {
  return (Date.now() - new Date(postedAt).getTime()) / 36e5;
}

function eligibleIntervals(hours) {
  const tags = [];
  if (hours >= 1) tags.push('+1h');
  if (hours >= 24) tags.push('+24h');
  if (hours >= 168) tags.push('+7d');
  return tags;
}

async function fetchPostMetrics(postId, token) {
  const [basicRes, insightsRes] = await Promise.allSettled([
    axios.get(`${FB_BASE}/${postId}`, {
      params: {
        fields: 'reactions.summary(true),comments.summary(true),shares',
        access_token: token,
      },
      timeout: 12000,
    }),
    axios.get(`${FB_BASE}/${postId}/insights`, {
      params: {
        metric: 'post_impressions,post_engaged_users,post_clicks',
        period: 'lifetime',
        access_token: token,
      },
      timeout: 12000,
    }),
  ]);

  if (basicRes.status === 'rejected') {
    const err = basicRes.reason;
    const code = err.response?.data?.error?.code;
    const status = err.response?.status;
    if (status === 401 || code === 190)
      throw Object.assign(new Error('Auth error'), { isAuthError: true });
    if ([4, 17, 32].includes(code) || status === 429)
      throw Object.assign(err, { isRateLimit: true });
    throw err;
  }

  const basic = basicRes.value.data;
  const insights = insightsRes.status === 'fulfilled' ? insightsRes.value.data : null;

  const insightVal = (name) => {
    const item = insights?.data?.find((d) => d.name === name);
    const v = item?.values?.[0]?.value;
    return typeof v === 'number' ? v : null;
  };

  return {
    reactions_total: basic?.reactions?.summary?.total_count ?? null,
    comments: basic?.comments?.summary?.total_count ?? null,
    shares: basic?.shares?.count ?? null,
    impressions: insightVal('post_impressions'),
    engaged_users: insightVal('post_engaged_users'),
    clicks: insightVal('post_clicks'),
    raw_response: { basic, insights: insights ?? insightsRes.reason?.response?.data ?? null },
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(postId, token, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchPostMetrics(postId, token);
    } catch (err) {
      if (err.isAuthError) throw err;
      if (err.isRateLimit) {
        const delay = Math.pow(2, attempt) * 3000;
        console.error(
          `  Rate limit — backing off ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await sleep(delay);
        continue;
      }
      if (attempt < maxRetries - 1) {
        await sleep(1500);
        continue;
      }
      throw err;
    }
  }
}

async function scrapePendingMetrics() {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 36e5).toISOString();

  const { data: posts, error } = await supabase
    .from('articles')
    .select('id, country, fb_post_id, posted_at')
    .eq('status', 'posted')
    .not('fb_post_id', 'is', null)
    .not('posted_at', 'is', null)
    .gte('posted_at', cutoff)
    .order('posted_at', { ascending: false });

  if (error) throw error;

  if (!posts?.length) {
    console.log('No posts within 8-day window to scrape.');
    return;
  }

  console.log(`Scraping metrics for ${posts.length} post(s).\n`);

  let recorded = 0;
  let skipped = 0;
  const errors = [];
  const failedCountries = new Set();
  const missingTokenCountries = new Set();

  for (const post of posts) {
    if (failedCountries.has(post.country)) {
      skipped++;
      continue;
    }

    const hours = ageHours(post.posted_at);
    const eligible = eligibleIntervals(hours);
    if (!eligible.length) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from('post_metrics')
      .select('interval_tag')
      .eq('article_id', post.id);

    const done = new Set((existing ?? []).map((r) => r.interval_tag));
    const needed = eligible.filter((t) => !done.has(t));
    if (!needed.length) {
      skipped++;
      continue;
    }

    const token = process.env[`FB_ACCESS_TOKEN_${post.country}`];
    if (!token) {
      if (!missingTokenCountries.has(post.country)) {
        console.warn(
          `  ⚠ No FB token for ${post.country} — skipping (set FB_ACCESS_TOKEN_${post.country} to enable)`,
        );
        missingTokenCountries.add(post.country);
      }
      skipped++;
      continue;
    }

    try {
      const metrics = await fetchWithRetry(post.fb_post_id, token);

      for (const interval_tag of needed) {
        const { error: insertErr } = await supabase.from('post_metrics').insert({
          article_id: post.id,
          fb_post_id: post.fb_post_id,
          interval_tag,
          snapshot_at: new Date().toISOString(),
          ...metrics,
        });

        if (insertErr && !insertErr.message.includes('unique')) {
          console.error(`  DB error [${post.id} ${interval_tag}]: ${insertErr.message}`);
        } else if (!insertErr) {
          recorded++;
          console.log(
            `  ✓ [${post.country}] ${post.fb_post_id} ${interval_tag} — ❤ ${metrics.reactions_total ?? '?'} · 💬 ${metrics.comments ?? '?'} · ↗ ${metrics.shares ?? '?'}`,
          );
        }
      }
    } catch (err) {
      if (err.isAuthError) {
        console.error(
          `  Auth error for ${post.country} — token expired? Skipping remaining ${post.country} posts.`,
        );
        failedCountries.add(post.country);
      }
      errors.push({ id: post.id, error: err.message });
      console.error(`  ✗ [${post.country}] ${post.fb_post_id}: ${err.message}`);
    }
  }

  if (missingTokenCountries.size) {
    console.log(`  Countries skipped (no token): ${[...missingTokenCountries].join(', ')}`);
  }
  console.log(
    `\nDone — ${recorded} new snapshot(s) recorded, ${skipped} skipped, ${errors.length} error(s).`,
  );
  if (errors.length) {
    for (const e of errors) console.error(`  - ${e.id}: ${e.error}`);
    process.exit(1);
  }
}

scrapePendingMetrics().catch((err) => {
  console.error('SCRAPER FAILED:', err.message);
  process.exit(1);
});
