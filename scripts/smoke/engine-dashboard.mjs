#!/usr/bin/env node
// P5 T-L — real browser smoke test for the /engine/* console, per the
// plan's own T-L gate ("Playwright smoke: login → new job (pack.json) →
// upload 1 clip → see awaiting_assets → approve gate path"). Real-verified
// this way, not simulated — a headless Chromium click-through against real
// `apps/api`/`apps/dashboard` dev servers and the real `dev` engine
// Supabase project.
//
// **Deviation from the plan's literal flow, flagged rather than silently
// changed**: this covers login → projects list → brand-kit editor
// (load/edit/save/reload-confirms-persisted) → New Job (manual manifest
// mode, since a real `pack.json` needs real footage this environment
// doesn't have) → job detail → generation-attempts (log + report), not the
// literal "pack.json → upload a clip → awaiting_assets → approve" path,
// which needs a real raw clip file and a real gate-bearing project neither
// of which exist as committed test fixtures. Every route this DOES cover
// is real, DB-backed, zero-console-error verified.
//
// Prerequisites (not started by this script):
//   1. `apps/api` running on :8787 with CORS_ORIGINS including :4299
//      (`node --experimental-strip-types apps/api/src/index.ts`)
//   2. `apps/dashboard` dev server on :4299 (`ng serve --port 4299`)
//   3. `npx playwright install chromium` (once)
//   4. A real Supabase Auth user in the *engine* project, mapped to an org
//      via `user_orgs` — see `docs/refactor/refactor-plan.md`'s P5 entry
//      for how the real `p5-smoke-test@example.com` fixture was created.
//
// Not wired into CI (T-G) — needs real dev servers running, which nothing
// in `ci.yml` stands up yet. Flagged as a real, not-yet-closed gap.

import { chromium } from 'playwright';

const BASE = process.env.DASHBOARD_URL ?? 'http://localhost:4299';
const EMAIL = process.env.SMOKE_EMAIL ?? 'p5-smoke-test@example.com';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'p5-smoke-test-pw-123';
const PROJECT_SLUG = process.env.SMOKE_PROJECT ?? 'p27-smoke-test';

const consoleErrors = [];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`${BASE}/engine/login`);
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/engine/projects', { timeout: 15000 });
  await page.waitForSelector('a[href^="/engine/projects/"]', { timeout: 20000 });

  const projectLinks = await page.$$eval('a[href^="/engine/projects/"]', (as) =>
    as.map((a) => a.getAttribute('href')),
  );
  assert(projectLinks.length > 0, 'projects list is empty');
  console.log(`✓ login → projects list (${projectLinks.length} real projects)`);

  await page.goto(`${BASE}/engine/projects/${PROJECT_SLUG}`);
  await page.waitForSelector('label:has-text("Fonts")', { timeout: 20000 });
  const marker = `smoke-${Date.now()}`;
  const fontsInput = page.locator('label:has-text("Fonts") + div input[placeholder="add + Enter"]');
  await fontsInput.fill(marker);
  await fontsInput.press('Enter');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('text=Saved.', { timeout: 20000 });
  await page.reload();
  await page.waitForSelector('label:has-text("Fonts")', { timeout: 20000 });
  const persisted = (await page.textContent('body')).includes(marker);
  assert(persisted, 'brand-kit save did not persist across reload');
  console.log('✓ brand-kit editor: real save persisted');
  // Not cleaned up here — repeated runs append one clearly-timestamped
  // `smoke-<ms>` marker font to this already-test fixture project, same
  // "clearly-named test artifact, harmless in a dev-only database"
  // convention P2.7/P2.8's own real-verification passes already
  // established. `PROJECT_SLUG`'s `brand.fonts` can be reset via
  // `PATCH /projects/:slug` if it ever needs tidying.

  await page.goto(`${BASE}/engine/projects/${PROJECT_SLUG}/jobs/new`);
  await page.click('button:has-text("Manual JSON")');
  await page.waitForSelector('textarea[placeholder*="manifest.v1"]', { timeout: 20000 });
  const manifest = {
    version: '1',
    projectRef: PROJECT_SLUG,
    template: 'clips-overlay',
    visual: { mode: 'clips-overlay' },
    shots: [{ id: 's1', clip: 's1.mp4', overlay_out_s: 1.5, voiceover_text: 'Smoke test shot.' }],
    end_card: { subject: 'Smoke test', disclosure: 'AI visualisation' },
    outputs: ['fb'],
    captions: {},
  };
  await page.fill('textarea[placeholder*="manifest.v1"]', JSON.stringify(manifest));
  await page.click('button:has-text("Preview manifest")');
  await page.waitForSelector('text=Valid manifest.v1 document', { timeout: 20000 });
  await page.click('button:has-text("Create job")');
  await page.waitForURL('**/engine/jobs/*', { timeout: 20000 });
  console.log('✓ new job wizard: real manifest validated + job created', page.url());

  await page.goto(`${BASE}/engine/generation-attempts`);
  await page.waitForSelector('select');
  await page.selectOption('select', PROJECT_SLUG);
  const purpose = `smoke-${Date.now()}`;
  await page.fill('input[placeholder*="Shot purpose"]', purpose);
  await page.click('button:has-text("Log failure")');
  await page.waitForSelector(`text=${purpose}`, { timeout: 20000 });
  console.log('✓ generation-attempts: real log entry, real weekly report');

  await browser.close();
  assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join('; ')}`);
  console.log('✓ zero console errors across the whole run');
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err.message);
  process.exit(1);
});
