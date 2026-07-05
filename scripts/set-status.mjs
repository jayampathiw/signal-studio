/**
 * F2-1: Atomic status updater for longform projects.
 * Usage: node scripts/set-status.mjs --project 29 --status rendering [--note "reason"]
 */
import { parseArgs } from 'util';
import { createClient } from '@supabase/supabase-js';
import { env } from '@signal-studio/config';

const ALLOWED_STATUSES = [
  'brief',
  'scripting',
  'awaiting_script_approval',
  'seeding',
  'awaiting_refs',
  'awaiting_stills',
  'awaiting_final_approval',
  'rendering',
  'rendered',
  'publishing',
  'posted',
  'failed',
  'blocked',
];

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    status:  { type: 'string' },
    note:    { type: 'string', default: '' },
  },
  strict: false,
});

const projectId = Number(values.project);
const status    = values.status;
const note      = values.note;

if (!projectId || !status) {
  console.error('Usage: set-status.mjs --project <id> --status <status> [--note "..."]');
  console.error('Allowed statuses:', ALLOWED_STATUSES.join(', '));
  process.exit(1);
}

if (!ALLOWED_STATUSES.includes(status)) {
  console.error(`Invalid status: "${status}"`);
  console.error('Allowed:', ALLOWED_STATUSES.join(', '));
  process.exit(1);
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const update = { status };
if (note) update.status_note = note;

const { data, error } = await db
  .from('content_items')
  .update(update)
  .eq('id', projectId)
  .select('id, status, status_note')
  .single();

if (error) {
  console.error(`DB error: ${error.message}`);
  process.exit(1);
}

console.log(`project ${data.id}: status=${data.status}${data.status_note ? ` note="${data.status_note}"` : ''}`);
