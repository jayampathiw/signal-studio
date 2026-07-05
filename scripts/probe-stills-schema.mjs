import { getServiceClient } from '@signal-studio/database';

const db = getServiceClient();
const PROBE_PROJECT = 999999;
let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}: ${e.message}`);
    failed++;
  }
}

async function expectError(label, fn) {
  try {
    await fn();
    console.error(`  ✗ ${label}: expected error but got none`);
    failed++;
  } catch {
    console.log(`  ✓ ${label} (correctly rejected)`);
    passed++;
  }
}

async function main() {
  console.log('Probing content_stills schema constraints…\n');

  // Seed a dummy content_items row
  const { data: item, error: iErr } = await db
    .from('content_items')
    .upsert({ id: PROBE_PROJECT, title: '__probe__', status: 'brief', channel_key: 'football/documentary/EN' }, { onConflict: 'id' })
    .select('id')
    .single();
  if (iErr) throw new Error(`Setup failed: ${iErr.message}`);

  await check('insert valid still row', async () => {
    const { error } = await db.from('content_stills').upsert({
      project_id: PROBE_PROJECT, scene_n: 1, cut: 'A', act: 0,
      prompt: 'test prompt', motion: 'push', image_source: 'google',
    }, { onConflict: 'project_id,scene_n,cut' });
    if (error) throw new Error(error.message);
  });

  await check('insert second cut (B) same scene', async () => {
    const { error } = await db.from('content_stills').upsert({
      project_id: PROBE_PROJECT, scene_n: 1, cut: 'B', act: 0,
      motion: 'smash', image_source: 'reuse', reuse_of: 'S01-A',
    }, { onConflict: 'project_id,scene_n,cut' });
    if (error) throw new Error(error.message);
  });

  await expectError('duplicate (project, scene, cut) rejected', async () => {
    const { error } = await db.from('content_stills').insert({
      project_id: PROBE_PROJECT, scene_n: 1, cut: 'A',
      motion: 'push', image_source: 'google',
    });
    if (error) throw new Error(error.message);
  });

  await expectError('invalid motion value rejected', async () => {
    const { error } = await db.from('content_stills').insert({
      project_id: PROBE_PROJECT, scene_n: 2, cut: 'A',
      motion: 'zoom', image_source: 'google',
    });
    if (error) throw new Error(error.message);
  });

  await expectError('invalid cut letter rejected', async () => {
    const { error } = await db.from('content_stills').insert({
      project_id: PROBE_PROJECT, scene_n: 3, cut: 'Z',
      motion: 'push', image_source: 'google',
    });
    if (error) throw new Error(error.message);
  });

  await check('new content_items status: awaiting_refs', async () => {
    const { error } = await db.from('content_items')
      .update({ status: 'awaiting_refs' }).eq('id', PROBE_PROJECT);
    if (error) throw new Error(error.message);
  });

  await check('new content_items status: awaiting_stills', async () => {
    const { error } = await db.from('content_items')
      .update({ status: 'awaiting_stills' }).eq('id', PROBE_PROJECT);
    if (error) throw new Error(error.message);
  });

  await expectError('invalid status rejected', async () => {
    const { error } = await db.from('content_items')
      .update({ status: 'not_a_real_status' }).eq('id', PROBE_PROJECT);
    if (error) throw new Error(error.message);
  });

  await check('content_clips overlays column writable', async () => {
    const { data: clip } = await db.from('content_clips')
      .select('id').eq('project_id', PROBE_PROJECT).limit(1);
    if (!clip?.length) return;
    const { error } = await db.from('content_clips')
      .update({ overlays: [{ at: 6, text: 'test', style: 'small_cream' }] })
      .eq('id', clip[0].id);
    if (error) throw new Error(error.message);
  });

  // Cleanup
  await db.from('content_stills').delete().eq('project_id', PROBE_PROJECT);
  await db.from('content_items').delete().eq('id', PROBE_PROJECT);

  console.log(`\n${passed + failed === 0 ? 'No tests ran' : `${passed}/${passed + failed} checks passed`}`);
  if (failed > 0) { console.error('PROBE FAILED'); process.exit(1); }
  console.log('ALL CONSTRAINTS OK');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
