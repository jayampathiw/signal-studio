import { getServiceClient } from './supabase.js';

export async function createBrief({ channelKey, format, title, description, slot, scheduledFor }) {
  const { data, error } = await getServiceClient()
    .from('content_items')
    .insert({
      channel_key:   channelKey,
      format,
      title,
      description,
      status:        'brief',
      scenes:        [],
      slot:          slot ?? null,
      scheduled_for: scheduledFor ?? null,
    })
    .select('id, title, format, slot')
    .single();

  if (error) throw new Error(`createBrief failed: ${error.message}`);
  return data;
}

export async function listRecentBriefs({ channelKey, days = 30 }) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await getServiceClient()
    .from('content_items')
    .select('id, title, description, created_at')
    .eq('channel_key', channelKey)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`listRecentBriefs failed: ${error.message}`);
  return data ?? [];
}
