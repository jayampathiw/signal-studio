import { getServiceClient } from './supabase.js';

// TODO: migrate from facebook-news-pipeline/src/services/supabase.js
// All article CRUD (upsert, updateStatus, updateAiFields, getByStatus, deleteOld) goes here.

export async function upsertArticle(article) {
  const { error } = await getServiceClient().from('articles').upsert(article, { onConflict: 'url' });
  if (error) throw error;
}

export async function updateArticleStatus(id, status) {
  const { error } = await getServiceClient().from('articles').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function getPendingArticles(country) {
  const query = getServiceClient().from('articles').select('*').eq('status', 'pending').order('publish_score', { ascending: false });
  if (country) query.eq('country', country);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
