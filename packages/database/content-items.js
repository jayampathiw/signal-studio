import { getServiceClient } from './supabase.js';

// TODO: migrate from reels-pipeline DB helpers
// Content item CRUD for video pipeline (content_items table).

export async function upsertContentItem(item) {
  const { error } = await getServiceClient().from('content_items').upsert(item, { onConflict: 'id' });
  if (error) throw error;
}

export async function updateContentItemStatus(id, status, extras = {}) {
  const { error } = await getServiceClient().from('content_items').update({ status, ...extras }).eq('id', id);
  if (error) throw error;
}

export async function getPendingContentItems(channelId) {
  const query = getServiceClient().from('content_items').select('*').eq('status', 'pending');
  if (channelId) query.eq('channel_id', channelId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
