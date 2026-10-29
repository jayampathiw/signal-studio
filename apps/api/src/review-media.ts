import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { ASSETS_PROOF_KIND } from '@signal-studio/core/state';
import type { ArtifactRow } from '@signal-studio/db/repos';

/**
 * Lets a claude.ai chat review a job without the dashboard: `get_job` lists
 * the job's media links, and `get_review_media` returns the images
 * themselves — the `assets_review` proofs before render, or evenly spaced
 * frames from the rendered video after. claude.ai can't play an mp4 inline,
 * so the video itself is only ever a link.
 *
 * Frames are cut by ffmpeg straight from the public R2 URL (the API runs in
 * the worker image, which ships ffmpeg) and sent as JPEG, so a review stays
 * well under MCP response limits.
 */

const execFileAsync = promisify(execFile);

export type GrabFrame = (url: string, opts: { atSec?: number; width: number }) => Promise<Buffer>;
export type ProbeDuration = (url: string) => Promise<number>;

export type ReviewMediaDeps = { grabFrame: GrabFrame; probeDuration: ProbeDuration };

export const ffmpegReviewMedia: ReviewMediaDeps = {
  async grabFrame(url, { atSec, width }) {
    const seek = atSec === undefined ? [] : ['-ss', atSec.toFixed(2)];
    const { stdout } = await execFileAsync(
      'ffmpeg',
      [
        '-v',
        'error',
        ...seek,
        '-i',
        url,
        '-frames:v',
        '1',
        '-vf',
        `scale=${width}:-2`,
        '-q:v',
        '4',
        '-f',
        'mjpeg',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout: 60_000 },
    ).catch(() => ({ stdout: Buffer.alloc(0) }));
    return stdout;
  },
  async probeDuration(url) {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url],
      { timeout: 30_000 },
    );
    return Number(stdout.trim());
  },
};

export type JobMedia = {
  videos: Array<{ outputId: string; url: string }>;
  proofs: Array<{ shotId: string; url: string; page?: number }>;
  posts: Array<{ platform: string; url: string }>;
};

export function summarizeMedia(artifacts: ArtifactRow[]): JobMedia {
  const sorted = [...artifacts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const media: JobMedia = { videos: [], proofs: [], posts: [] };
  for (const a of sorted) {
    const meta = a.metadata ?? {};
    if (a.kind === 'video') {
      media.videos.push({ outputId: String(meta.outputId ?? ''), url: a.url });
    } else if (a.kind === ASSETS_PROOF_KIND) {
      media.proofs.push({
        shotId: String(meta.shotId ?? ''),
        url: a.url,
        ...(typeof meta.page === 'number' && { page: meta.page }),
      });
    } else if (a.kind === 'post') {
      media.posts.push({ platform: String(meta.platform ?? ''), url: a.url });
    }
  }
  return media;
}

type Block = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

const PROOF_WIDTH = 720;
const FRAME_WIDTH = 540;

/**
 * Before render (`awaiting_review:assets_review`, or proofs and no video
 * yet) the proofs are what needs checking; once a video exists, its frames.
 * A frame ffmpeg can't cut is reported as text rather than failing the call.
 */
export async function buildReviewMedia(
  deps: ReviewMediaDeps,
  status: string,
  media: JobMedia,
  frameCount: number,
): Promise<Block[]> {
  const blocks: Block[] = [{ type: 'text', text: JSON.stringify({ status, ...media }) }];
  const showProofs =
    status === 'awaiting_review:assets_review' ||
    (media.videos.length === 0 && media.proofs.length > 0);

  if (showProofs) {
    for (const proof of media.proofs) {
      const label = `Proof for shot ${proof.shotId}${proof.page ? `, page ${proof.page}` : ''}`;
      blocks.push(...(await imageBlocks(deps, label, proof.url, { width: PROOF_WIDTH })));
    }
    return blocks;
  }

  const video = media.videos.find((v) => v.outputId === 'fb') ?? media.videos[0];
  if (!video) {
    blocks.push({ type: 'text', text: 'Nothing to review yet: no proofs or rendered video.' });
    return blocks;
  }
  const duration = await deps.probeDuration(video.url);
  if (!Number.isFinite(duration) || duration <= 0) {
    blocks.push({ type: 'text', text: `Could not read the video's duration: ${video.url}` });
    return blocks;
  }
  for (let i = 0; i < frameCount; i++) {
    const atSec = ((i + 0.5) * duration) / frameCount;
    const label = `Frame at ${atSec.toFixed(1)}s of ${duration.toFixed(1)}s (${video.outputId})`;
    blocks.push(...(await imageBlocks(deps, label, video.url, { atSec, width: FRAME_WIDTH })));
  }
  return blocks;
}

async function imageBlocks(
  deps: ReviewMediaDeps,
  label: string,
  url: string,
  opts: { atSec?: number; width: number },
): Promise<Block[]> {
  const jpeg = await deps.grabFrame(url, opts);
  if (jpeg.length === 0) return [{ type: 'text', text: `${label}: could not be read (${url})` }];
  return [
    { type: 'text', text: label },
    { type: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' },
  ];
}
