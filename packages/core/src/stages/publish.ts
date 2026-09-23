import { createHash } from 'node:crypto';

import type { Job, StageDefinition } from '../runner/index.ts';

/**
 * P3.5 — the `publish` stage: for each platform in `manifest.publish[]`,
 * builds that platform's caption from `manifest.captions`/hashtags/
 * disclosure and calls the caller-supplied `publish()` function, recording
 * `{kind: 'post', url, postId}` per the plan's own bullet.
 *
 * **Deliberately takes a plain `publish` function, not `PublishProvider`**
 * — same reasoning `tts.ts`'s own header gives for not importing
 * `TtsProvider`: keeps `packages/core` free of a `@signal-studio/providers`
 * dependency for a type-only need. The caller (`apps/worker`'s `run-job`,
 * once wired — **not done this pass**, see below) binds this to a real
 * multi-platform dispatcher (or a single provider's `.post`, when a job
 * only targets one platform) or a fake in tests.
 *
 * **Not wired into `ss run-job`/`ss run-local` this pass** — those commands
 * don't call this stage yet. Building the real per-platform dispatch (which
 * `PublishProvider` implementation handles which `manifest.publish[]`
 * entry, and how a job's already-rendered/uploaded output URL gets matched
 * to a platform) is real integration work for whoever wires "run-job
 * actually publishes" next; this stage is the tested, ready-to-call
 * building block for that.
 */

export type PublishFn = (args: {
  platform: string;
  pageRef: string;
  video: string;
  caption: string;
  title?: string;
  scheduleAt?: string;
  aiDisclosure?: boolean;
}) => Promise<{ postId: string; url?: string }>;

export type PublishStageOptions = {
  publish: PublishFn;
  // platform -> credential ref (project.v1's PublishTarget.credentialRef —
  // already resolved by the caller from the project, not looked up here).
  publishTargets: Record<string, string>;
  // platform -> the real rendered/uploaded video URL to publish for it.
  renderedVideoUrls: Record<string, string>;
  scheduleAt?: string;
  aiDisclosure?: boolean;
};

type PublishManifest = {
  publish: string[];
  disclosure?: boolean;
  end_card?: { disclosure?: string };
  captions?: {
    facebook?: string;
    facebook_question?: string;
    instagram?: string;
    youtube_shorts_title?: string;
    youtube_description?: string;
    hashtags_facebook?: string[];
    hashtags_instagram?: string[];
  };
};

function hashtagLine(tags?: string[]): string {
  return (tags ?? []).map((h) => `#${h.replace(/^#/, '')}`).join(' ');
}

function buildCaption(
  platform: string,
  manifest: PublishManifest,
): { caption: string; title?: string } {
  const c = manifest.captions ?? {};
  const disclosureLine =
    manifest.disclosure && manifest.end_card?.disclosure ? manifest.end_card.disclosure : '';

  if (platform === 'facebook') {
    const parts = [
      c.facebook,
      c.facebook_question,
      hashtagLine(c.hashtags_facebook),
      disclosureLine,
    ];
    return { caption: parts.filter(Boolean).join('\n\n') };
  }
  if (platform === 'instagram') {
    const parts = [c.instagram, hashtagLine(c.hashtags_instagram), disclosureLine];
    return { caption: parts.filter(Boolean).join('\n\n') };
  }
  if (platform === 'youtube') {
    const parts = [c.youtube_description, disclosureLine];
    return { caption: parts.filter(Boolean).join('\n\n'), title: c.youtube_shorts_title };
  }
  // Unknown platform: no per-platform caption fields exist yet for it —
  // fail clearly rather than silently publish with an empty caption.
  throw new Error(`publish stage: no caption-building rule for platform "${platform}"`);
}

function getManifest(job: Job): PublishManifest {
  const publish = (job.manifest as { publish?: unknown }).publish;
  if (!Array.isArray(publish))
    throw new Error('publish stage: job.manifest.publish must be an array');
  return job.manifest as unknown as PublishManifest;
}

export function createPublishStage(opts: PublishStageOptions): StageDefinition {
  return {
    name: 'publish',
    inputsHash(job) {
      const manifest = getManifest(job);
      const fingerprint = {
        platforms: manifest.publish,
        videos: opts.renderedVideoUrls,
        scheduleAt: opts.scheduleAt ?? null,
      };
      return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex').slice(0, 16);
    },
    async run(ctx) {
      const manifest = getManifest(ctx.job);
      const posts: Record<string, { postId: string; url?: string }> = {};

      for (const platform of manifest.publish ?? []) {
        if (ctx.cancelled()) break;

        const pageRef = opts.publishTargets[platform];
        if (!pageRef) {
          throw new Error(`publish stage: no publishTarget configured for platform "${platform}"`);
        }
        const video = opts.renderedVideoUrls[platform];
        if (!video) {
          throw new Error(
            `publish stage: no rendered video URL supplied for platform "${platform}"`,
          );
        }

        const { caption, title } = buildCaption(platform, manifest);
        if (!caption) {
          throw new Error(
            `publish stage: empty caption for platform "${platform}" — check manifest.captions`,
          );
        }

        const result = await opts.publish({
          platform,
          pageRef,
          video,
          caption,
          title,
          scheduleAt: opts.scheduleAt,
          aiDisclosure: opts.aiDisclosure,
        });
        posts[platform] = result;
      }

      return { outputs: { posts } };
    },
  };
}
