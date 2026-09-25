import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createEngineClient } from '@signal-studio/db/client';
import { ArtifactsRepo, JobsRepo, JobStagesRepo, ProjectsRepo } from '@signal-studio/db/repos';
import { createAnthropicProvider } from '@signal-studio/providers/llm-anthropic';
import { createKokoroJsProvider } from '@signal-studio/providers/tts-kokoro-js';
import { getEngine } from '@signal-studio/render-core/engine';
import { renderCarouselStills } from '@signal-studio/render-remotion/render-stills';
import { compile as compileCarousel } from '@signal-studio/template-carousel/compile';
import { compile as compileCaseFile } from '@signal-studio/template-case-file/compile';
import { compile as compileClipsOverlay } from '@signal-studio/template-clips-overlay/compile';
import { compile as compileCompilation } from '@signal-studio/template-compilation/compile';
import { compile as compileShorts916 } from '@signal-studio/template-shorts-916/compile';
import { compile as compileStillsKenburns } from '@signal-studio/template-stills-kenburns/compile';
import { parseShotlistText as parseShotlistV2 } from '@signal-studio/template-stills-kenburns/parsers/parse-shotlist-v2';
// Side-effect imports: register the 'remotion'/'ffmpeg' engines with render-core.
import '@signal-studio/render-remotion';
import '@signal-studio/render-ffmpeg';

import type { DigestDeps } from './commands/digest.ts';
import type { MarkFailedDeps } from './commands/mark-failed.ts';
import type { RunJobDeps } from './commands/run-job.ts';
import type { RunLocalDeps } from './commands/run-local.ts';
import type { UploadDeps } from './commands/upload.ts';
import type { BossQueue, WorkerDeps } from './commands/worker.ts';
import { createCarouselPublishProviderFor, createPublishProviderFor } from './publish.ts';
import { detectBlackFrames, measureVideo } from './qa-measure.ts';
import { createVisionCheck } from './qa-vision.ts';
import { createErrorReporter } from './sentry.ts';
import { createStorageProviderFor } from './storage.ts';

/**
 * Real (non-test) dependency wiring for each command — kept in one file so
 * `cli.ts` stays a thin argv/dispatch layer and every command's own file
 * stays testable against fakes without importing any of this (importing
 * `@signal-studio/render-remotion` alone pulls in Remotion's bundler/
 * headless-Chrome toolchain — not something a command's own unit tests
 * should need just to load the module).
 */

function realTts() {
  return createKokoroJsProvider().synthesise;
}

function realRender() {
  return getEngine('remotion').render;
}

function realRenderFfmpeg() {
  return getEngine('ffmpeg').render;
}

export function realRunLocalDeps(): RunLocalDeps {
  return { synthesise: realTts(), compileClipsOverlay, render: realRender() };
}

// P2's T-L gate ("ss run-local on examples/clips-overlay with fakes <
// 3 min"): the `assets` stage still runs for real (ffmpeg is fast against a
// tiny synthetic clip), but TTS synthesis and the Remotion render — the two
// genuinely slow, model/browser-loading steps — are swapped for instant
// stand-ins. This is for checking the pipeline's own wiring quickly during
// development, not for judging real output quality.
export function fakeRunLocalDeps(): RunLocalDeps {
  return {
    async synthesise({ text }) {
      const wavPath = path.join(
        os.tmpdir(),
        `fake-tts-${createHash('sha256').update(text).digest('hex').slice(0, 12)}.wav`,
      );
      await writeFile(wavPath, Buffer.alloc(44)); // a WAV header's worth of silence
      return { wavPath, durationSec: 2 };
    },
    compileClipsOverlay,
    async render(timeline, opts) {
      await mkdir(opts.outputDir, { recursive: true });
      const outputPath = path.join(opts.outputDir, `${timeline.contentId}.mp4`);
      await writeFile(outputPath, `fake render of ${timeline.scenes.length} scene(s)`);
      return outputPath;
    },
  };
}

export function realRunJobDeps(): RunJobDeps {
  const client = createEngineClient();
  return {
    jobsRepo: new JobsRepo(client),
    projectsRepo: new ProjectsRepo(client),
    createArtifactsRepo: (orgId: string) => new ArtifactsRepo(client, orgId),
    createStageStore: (orgId: string) => new JobStagesRepo(client, orgId),
    createStorage: createStorageProviderFor,
    synthesise: realTts(),
    compileClipsOverlay,
    compileCaseFile,
    compileStillsKenburns,
    compileShorts916,
    compileCompilation,
    compileCarousel,
    renderCarouselStills,
    createCarouselPublishProviderFor,
    parseShotlistV2,
    render: realRender(),
    renderFfmpeg: realRenderFfmpeg(),
    createPublishProviderFor,
    measureVideo,
    detectBlackFrames,
    // `createAnthropicProvider()` validates `ANTHROPIC_KEY` at construction
    // time — deferred inside this closure so it's only ever called (and
    // only ever needs that env var) for a job whose project actually has
    // `qa.visionCheck` set; every other job never touches this at all.
    visionCheck: (localPath: string) => createVisionCheck(createAnthropicProvider())(localPath),
  };
}

export function realUploadDeps(): UploadDeps {
  const client = createEngineClient();
  return {
    jobsRepo: new JobsRepo(client),
    projectsRepo: new ProjectsRepo(client),
    createArtifactsRepo: (orgId: string) => new ArtifactsRepo(client, orgId),
    createStorage: createStorageProviderFor,
  };
}

export function realMarkFailedDeps(): MarkFailedDeps {
  const client = createEngineClient();
  return {
    jobsRepo: new JobsRepo(client),
    createArtifactsRepo: (orgId: string) => new ArtifactsRepo(client, orgId),
  };
}

export function realDigestDeps(): DigestDeps {
  const client = createEngineClient();
  const jobsRepo = new JobsRepo(client);

  const githubPat = process.env.GITHUB_PAT;
  const githubUsername = process.env.GITHUB_USERNAME ?? process.env.GITHUB_REPO_OWNER;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  const smtpHost = process.env.SMTP_HOST;

  return {
    countsByStatus: (orgId: string) => jobsRepo.countsByStatus(orgId),
    // P4.3 — `GET /users/{username}/settings/billing/actions`. Verified
    // for real against the live API (not guessed, and not just trusted
    // from docs search results — an initial web search suggested
    // `/users/{username}/billing/actions`, which real-checking via `gh api`
    // showed is a genuinely wrong path (404); this one returns a real 403
    // "Resource not accessible by personal access token" whose
    // `documentation_url` confirms it's the exact right endpoint — just
    // needs a classic PAT with the `user` scope, which `GITHUB_PAT`
    // (scoped for `workflow_dispatch`) may not have — `digestCommand`
    // already treats a failure here as best-effort, not fatal.
    getActionsMinutesUsed:
      githubPat && githubUsername
        ? async () => {
            const res = await fetch(
              `https://api.github.com/users/${githubUsername}/settings/billing/actions`,
              {
                headers: {
                  Authorization: `Bearer ${githubPat}`,
                  Accept: 'application/vnd.github+json',
                  'X-GitHub-Api-Version': '2022-11-28',
                },
              },
            );
            if (!res.ok) {
              throw new Error(`GitHub Actions billing request failed (${res.status})`);
            }
            const data = (await res.json()) as { total_minutes_used: number };
            return data.total_minutes_used;
          }
        : undefined,
    sendTelegram:
      telegramToken && telegramChatId
        ? async (text: string) => {
            const res = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: telegramChatId, text }),
            });
            if (!res.ok) {
              throw new Error(`Telegram sendMessage failed (${res.status}): ${await res.text()}`);
            }
          }
        : undefined,
    sendEmail: smtpHost
      ? async (subject: string, text: string) => {
          const nodemailer = (await import('nodemailer')).default;
          const transport = nodemailer.createTransport({
            host: smtpHost,
            port: Number(process.env.SMTP_PORT ?? 587),
            auth: process.env.SMTP_USER
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
          });
          const from = process.env.DIGEST_EMAIL_FROM ?? 'signal-studio@localhost';
          const to = process.env.DIGEST_EMAIL_TO;
          if (!to) throw new Error('SMTP_HOST is set but DIGEST_EMAIL_TO is missing');
          await transport.sendMail({ from, to, subject, text });
        }
      : undefined,
  };
}

export function realWorkerDeps(runJob: (jobId: string) => Promise<void>): WorkerDeps {
  const client = createEngineClient();
  const jobsRepo = new JobsRepo(client);
  const healthchecksUrl = process.env.HEALTHCHECKS_PING_URL;
  return {
    runJob,
    heartbeat: (jobId: string) => jobsRepo.heartbeat(jobId),
    reapStaleRunning: (staleBefore: Date) => jobsRepo.reapStaleRunning(staleBefore),
    async createBoss(connectionString: string) {
      const PgBoss = (await import('pg-boss')).default;
      // pg-boss's own real type is a superset of `BossQueue` (this file's
      // own minimal, testable shape) — no adapter needed, only the fields
      // `worker.ts` actually calls are typed here.
      const boss = new PgBoss(connectionString);
      return boss as unknown as BossQueue;
    },
    // P4.3 — genuinely `undefined`, not a no-op function, when
    // HEALTHCHECKS_PING_URL isn't set (no Healthchecks.io account exists
    // for this deployment yet) — `workerCommand` skips the whole ping loop
    // in that case rather than starting a timer that would silently do
    // nothing on every tick.
    pingHealthcheck: healthchecksUrl
      ? async () => {
          const res = await fetch(healthchecksUrl);
          if (!res.ok) {
            throw new Error(`Healthchecks.io ping failed (${res.status})`);
          }
        }
      : undefined,
    reportError: createErrorReporter(process.env.SENTRY_DSN),
  };
}
