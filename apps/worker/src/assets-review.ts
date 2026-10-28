import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ManifestT, ShotHighlightT } from '@signal-studio/core/schemas';
import { GATE_APPROVAL_KIND } from '@signal-studio/core/state';
import type { ArtifactsRepo } from '@signal-studio/db/repos';
import type { StorageProvider } from '@signal-studio/providers/contracts';

import type { Logger } from './logger.ts';

/**
 * Track P (ADR-003, P.4) — the `assets_review` gate. Before anything
 * renders, every shot's visual (a fetched page, an image, the first frame of
 * a clip) is turned into a proof PNG with its highlight boxes drawn on, and
 * recorded as an `assets-proof` artifact the dashboard shows next to the
 * approve button.
 */

export const ASSETS_REVIEW_GATE = 'assets_review';
export const ASSETS_PROOF_KIND = 'assets-proof';

const execFileAsync = promisify(execFile);

export type DrawProof = (args: {
  input: string;
  output: string;
  boxes: ShotHighlightT[];
}) => Promise<void>;

// Yellow fill + red outline, like the legacy proof sheet; scaled to at most
// 1280 px wide so the dashboard loads it quickly.
export const drawProofWithFfmpeg: DrawProof = async ({ input, output, boxes }) => {
  const draw = boxes.flatMap((b) => {
    const geo = `x=iw*${b.x}:y=ih*${b.y}:w=iw*${b.width}:h=ih*${b.height}`;
    return [`drawbox=${geo}:color=yellow@0.35:t=fill`, `drawbox=${geo}:color=red@0.9:t=4`];
  });
  const vf = [...draw, "scale='min(1280,iw)':-2"].join(',');
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    vf,
    output,
  ]);
};

export async function assetsReviewApproved(
  artifactsRepo: Pick<ArtifactsRepo, 'listForJob'>,
  jobId: string,
): Promise<boolean> {
  const rows = await artifactsRepo.listForJob(jobId);
  return rows.some((r) => r.kind === GATE_APPROVAL_KIND && r.stage_name === ASSETS_REVIEW_GATE);
}

export async function recordAssetProofs(params: {
  jobId: string;
  shots: ManifestT['shots'];
  storage: StorageProvider;
  fetchFn: typeof fetch;
  tmpDir: string;
  artifactsRepo: Pick<ArtifactsRepo, 'record'>;
  logger: Logger;
  drawProof?: DrawProof;
}): Promise<number> {
  const { jobId, storage, fetchFn, tmpDir, artifactsRepo, logger } = params;
  const drawProof = params.drawProof ?? drawProofWithFfmpeg;
  const dir = path.join(tmpDir, 'assets-review');
  await mkdir(dir, { recursive: true });

  let count = 0;
  for (const shot of params.shots) {
    const file = shot.image ?? shot.clip;
    if (!file) continue;
    const res = await fetchFn(await storage.signedUrl(`jobs/${jobId}/uploads/${shot.id}/${file}`));
    if (!res.ok) {
      throw new Error(`assets_review: could not read shot "${shot.id}" (${file}) for its proof`);
    }
    const input = path.join(dir, `${shot.id}-${file}`);
    await writeFile(input, Buffer.from(await res.arrayBuffer()));

    const boxes = shot.highlights ?? (shot.highlight ? [shot.highlight] : []);
    const output = path.join(dir, `${shot.id}.png`);
    await drawProof({ input, output, boxes });
    const { url } = await storage.put({
      localPath: output,
      key: `jobs/${jobId}/review/${ASSETS_REVIEW_GATE}/${shot.id}.png`,
    });
    await artifactsRepo.record(jobId, ASSETS_REVIEW_GATE, ASSETS_PROOF_KIND, url, {
      shotId: shot.id,
      file,
      highlights: boxes.length,
      ...(shot.source && { source: shot.source.url, page: shot.source.page }),
    });
    count++;
  }
  logger.info('assets_review proofs recorded', { jobId, proofs: count });
  return count;
}
