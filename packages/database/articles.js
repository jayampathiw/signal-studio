import { getClient } from './supabase.js';

export async function saveArticles(articles) {
  const supabase = getClient();
  let saved = 0;

  for (const article of articles) {
    const { error } = await supabase.from('articles').insert(article);

    if (!error) {
      saved++;
    } else if (!error.message.includes('duplicate') && !error.message.includes('unique')) {
      console.error(`  DB insert error: ${error.message}`);
    }
  }

  return saved;
}

export async function updateArticle(id, fields) {
  const supabase = getClient();
  const { error } = await supabase.from('articles').update(fields).eq('id', id);
  if (error) console.error(`  DB update error: ${error.message}`);
}

export async function updateArticleStatus(id, status) {
  return updateArticle(id, { status });
}

export async function getPendingArticles(country = null) {
  const supabase = getClient();
  let query = supabase
    .from('articles')
    .select('*')
    .eq('status', 'pending')
    .order('priority_score', { ascending: false })
    .order('published_at', { ascending: false });

  if (country) query = query.eq('country', country);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getArticleById(id) {
  const supabase = getClient();
  const { data, error } = await supabase.from('articles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function deleteArticle(id) {
  const supabase = getClient();
  const { error } = await supabase.from('articles').delete().eq('id', id);
  if (error) throw new Error(`DB delete error: ${error.message}`);
}

export async function deleteArticlesByCountry(country) {
  const supabase = getClient();
  const { error, count } = await supabase.from('articles').delete({ count: 'exact' }).eq('country', country);
  if (error) throw new Error(`DB delete error: ${error.message}`);
  return count ?? 0;
}

export async function truncateArticles() {
  const supabase = getClient();
  const { error } = await supabase.from('articles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw new Error(`DB truncate error: ${error.message}`);
}

export async function getRecentSeedComments(country, limit = 20) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('articles')
    .select('seed_comment_template_id')
    .eq('country', country)
    .not('seed_comment_template_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(r => r.seed_comment_template_id).filter(Boolean);
}

export async function getRecentArticlesForClustering(country, windowHours = 6) {
  const supabase = getClient();
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, criticality, cluster_id, cluster_size')
    .eq('country', country)
    .gte('created_at', since);
  if (error) throw error;
  return data || [];
}

export async function getPillarWeeklyCounts(country) {
  const supabase = getClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('articles')
    .select('pillar')
    .eq('country', country)
    .eq('status', 'posted')
    .not('pillar', 'is', null)
    .gte('posted_at', since);
  if (error) throw error;
  const counts = {};
  for (const row of data ?? []) {
    counts[row.pillar] = (counts[row.pillar] ?? 0) + 1;
  }
  return counts;
}

export async function getPendingArticlesSortedByScore(country) {
  const supabase = getClient();
  let query = supabase
    .from('articles')
    .select('*')
    .eq('status', 'pending')
    .not('ai_caption', 'is', null)
    .order('editorial_score', { ascending: false, nullsFirst: false })
    .order('publish_score',   { ascending: false, nullsFirst: false });
  if (country) query = query.eq('country', country);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getFirstBoostIneligiblePostedIT() {
  const supabase = getClient();
  const { data, error } = await supabase
    .from('articles')
    .select('id, posted_at')
    .eq('country', 'IT')
    .eq('status', 'posted')
    .eq('boost_eligible', false)
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRecentArticleTitles(country, daysBack = 3) {
  const supabase = getClient();
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('articles')
    .select('title')
    .eq('country', country)
    .gte('created_at', since);
  if (error) throw error;
  return (data || []).map(r => r.title);
}
