import { getClient } from './supabase.js';

export async function insertContentItem(row) {
  const { data, error } = await getClient()
    .from('content_items')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getContentItem(id) {
  const { data, error } = await getClient()
    .from('content_items')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateContentItem(id, patch) {
  const { data, error } = await getClient()
    .from('content_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listContentItems({ channelKey, status, limit = 50 } = {}) {
  let q = getClient().from('content_items').select('*');
  if (channelKey) q = q.eq('channel_key', channelKey);
  if (status)     q = q.eq('status', status);
  q = q.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
