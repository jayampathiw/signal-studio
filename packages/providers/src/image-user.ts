import type { ImageProvider, ImageResultT } from './contracts.ts';

/**
 * P3.4 — `image-user`: the "not AI-generated, a human supplied this still"
 * counterpart to `image-fal`. **Deliberate reinterpretation of the
 * `ImageProvider` contract, flagged rather than guessed silently**: the
 * plan names this provider with no further spec, and `ImageProvider.generate`
 * only takes `{ prompt, aspect, size? }` — no field for "which pre-uploaded
 * image". The real source for a user-supplied still (per the edge functions
 * this phase's P3.7 retires — `upload-still` presigns an R2 PUT for the
 * user, `auto-match-still` matches it to a shot) is a manifest/shot-level
 * reference resolved *before* this provider is ever called, not a prompt.
 * So: this factory takes the resolved `{ shotId → path|url }` map at
 * construction time, and `generate()` treats its `prompt` argument as that
 * lookup key (the shot id) rather than a real generation prompt — same
 * "generate() is really just resolve()" shape a `NotImplementedProvider`
 * wrapper would need anyway, just backed by a real map instead of always
 * throwing. Throws a clear error naming the missing key, same convention as
 * `run-job.ts`'s missing-clip error.
 */
export function createUserImageProvider(images: Record<string, string>): ImageProvider {
  return {
    async generate({ prompt: shotId }): Promise<ImageResultT> {
      const ref = images[shotId];
      if (!ref) {
        throw new Error(
          `createUserImageProvider: no user-supplied image for shot "${shotId}" (have: ${Object.keys(images).join(', ') || '(none)'})`,
        );
      }
      return /^https?:\/\//i.test(ref) ? { url: ref } : { path: ref };
    },
  };
}
