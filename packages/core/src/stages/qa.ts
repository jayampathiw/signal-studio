import { createHash } from 'node:crypto';

import type { Job, StageDefinition } from '../runner/index.ts';

/**
 * P3.6 — the `qa` stage: checks a rendered output against measured/expected
 * values and (optionally) a vision spot-check, once per manifest output
 * (`multiOutput: true`).
 *
 * **Deliberately takes plain functions, not `StorageProvider`/`LlmProvider`**
 * — same reasoning `stages/tts.ts`/`stages/publish.ts`'s own headers give:
 * keeps `packages/core` free of a `@signal-studio/providers` dependency for
 * a type-only need. `measure`/`detectBlackFrames` are real ffprobe/ffmpeg
 * calls the caller (`apps/worker`) binds; `visionCheck` is optional and only
 * wired when the caller's project has `qa.visionCheck` set.
 *
 * **Duration/resolution/fps/true-peak are hard failures; integrated LUFS
 * and the overlay safe-zone are warnings, flagged deliberately, not by
 * oversight**: integrated LUFS is measured across the *whole* file
 * including silence, so a slower-paced video with long gaps between
 * narration beats will legitimately read much quieter than a fast-cut one
 * even though both were mixed through the identical `loudnorm` pass (real
 * golden references in this repo range from -17 to -27 LUFS on content
 * that's otherwise correct) — a tight target would false-positive on pacing,
 * not catch real defects. True peak has no such excuse: it's a hard ceiling
 * regardless of content, so it stays a real failure. The overlay safe-zone
 * check only covers `HighlightBox`-shaped free-form fraction boxes
 * (`timeline.scenes[].highlights[]`) — every other overlay kind in this
 * codebase (`KenBurnsOverlay.zone`, watermark `position`, etc.) resolves
 * through a *named* anchor system (`packages/render/ffmpeg/src/
 * placement.ts`'s own `PAD` margin) that's already safe by construction,
 * so re-checking those here would just be redundant, not a gap.
 */

export type QaMeasurement = {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  integratedLufs: number;
  truePeakDb: number;
};

export type QaBlackSegment = { startSec: number; endSec: number };

export type QaExpected = {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  targetLufs: number;
  maxTruePeakDb: number;
  highlights: Array<{ x: number; y: number; width: number; height: number }>;
  // Some templates end on a deliberately dark/near-black card (e.g.
  // `clips-overlay`'s end card, `#0B0B0F`) that `blackdetect` can't tell
  // apart from an actual broken/missing-asset frame just from pixel
  // darkness alone. Real bug found running this stage for real (P3.6,
  // 2026-09-24): the first live run flagged that exact end card as a black
  // segment. Rather than loosen the darkness threshold everywhere (which
  // would risk missing a real defect elsewhere in the frame), a caller
  // that knows a trailing window is intentionally dark passes its start
  // time here and any black segment starting at or after it is ignored.
  ignoreBlackAfterSec?: number;
};

export type QaCheck = { name: string; status: 'pass' | 'warn' | 'fail'; detail: string };

export type QaStageOptions = {
  measure: (outputId: string) => Promise<QaMeasurement>;
  detectBlackFrames: (outputId: string) => Promise<QaBlackSegment[]>;
  expected: (outputId: string) => QaExpected;
  // Omitted entirely (not just a project flag) when the caller's project
  // doesn't have `qa.visionCheck` set — a real Anthropic call otherwise
  // fires on every job regardless of the flag.
  visionCheck?: (outputId: string) => Promise<{ ok: boolean; notes: string }>;
  durationToleranceSec?: number;
  fpsTolerance?: number;
  lufsWarnTolerance?: number;
  blackFrameFailSec?: number;
  safeZoneMargin?: number;
};

export class QaFailedError extends Error {}

export function createQaStage(opts: QaStageOptions): StageDefinition {
  const durationTol = opts.durationToleranceSec ?? 1.0;
  const fpsTol = opts.fpsTolerance ?? 0.5;
  const lufsTol = opts.lufsWarnTolerance ?? 8;
  const blackFailSec = opts.blackFrameFailSec ?? 0.5;
  const margin = opts.safeZoneMargin ?? 0.06;

  return {
    name: 'qa',
    multiOutput: true,
    inputsHash(job: Job) {
      return createHash('sha256').update(JSON.stringify(job.manifest)).digest('hex').slice(0, 16);
    },
    async run(ctx) {
      const outputId = ctx.outputId;
      if (!outputId) throw new Error('qa stage: outputId is required (multiOutput)');

      const expected = opts.expected(outputId);
      const measured = await opts.measure(outputId);
      const checks: QaCheck[] = [];

      const durDiff = Math.abs(measured.durationSec - expected.durationSec);
      checks.push(
        durDiff > durationTol
          ? {
              name: 'duration',
              status: 'fail',
              detail: `measured ${measured.durationSec.toFixed(2)}s vs expected ${expected.durationSec.toFixed(2)}s (off by ${durDiff.toFixed(2)}s, tolerance ${durationTol}s) — check compile()'s duration math for this output`,
            }
          : {
              name: 'duration',
              status: 'pass',
              detail: `${measured.durationSec.toFixed(2)}s (expected ${expected.durationSec.toFixed(2)}s)`,
            },
      );

      checks.push(
        measured.width !== expected.width || measured.height !== expected.height
          ? {
              name: 'resolution',
              status: 'fail',
              detail: `measured ${measured.width}x${measured.height} vs expected ${expected.width}x${expected.height} — wrong aspect ratio rendered`,
            }
          : { name: 'resolution', status: 'pass', detail: `${measured.width}x${measured.height}` },
      );

      const fpsDiff = Math.abs(measured.fps - expected.fps);
      checks.push(
        fpsDiff > fpsTol
          ? {
              name: 'fps',
              status: 'fail',
              detail: `measured ${measured.fps.toFixed(2)} vs expected ${expected.fps.toFixed(2)} (tolerance ${fpsTol})`,
            }
          : { name: 'fps', status: 'pass', detail: measured.fps.toFixed(2) },
      );

      const lufsDiff = Math.abs(measured.integratedLufs - expected.targetLufs);
      checks.push(
        lufsDiff > lufsTol
          ? {
              name: 'integratedLufs',
              status: 'warn',
              detail: `measured ${measured.integratedLufs.toFixed(2)} LUFS vs target ${expected.targetLufs} (off by ${lufsDiff.toFixed(2)} LU) — verify this isn't a silent/broken audio track, not necessarily a defect on its own`,
            }
          : {
              name: 'integratedLufs',
              status: 'pass',
              detail: `${measured.integratedLufs.toFixed(2)} LUFS`,
            },
      );

      checks.push(
        measured.truePeakDb > expected.maxTruePeakDb
          ? {
              name: 'truePeak',
              status: 'fail',
              detail: `measured ${measured.truePeakDb.toFixed(2)} dBTP exceeds ceiling ${expected.maxTruePeakDb} dBTP — audio may clip on playback, check the mix's final limiter`,
            }
          : { name: 'truePeak', status: 'pass', detail: `${measured.truePeakDb.toFixed(2)} dBTP` },
      );

      const allBlackSegs = await opts.detectBlackFrames(outputId);
      const blackSegs =
        expected.ignoreBlackAfterSec == null
          ? allBlackSegs
          : allBlackSegs.filter((s) => s.startSec < expected.ignoreBlackAfterSec!);
      const longBlack = blackSegs.filter((s) => s.endSec - s.startSec >= blackFailSec);
      if (longBlack.length) {
        checks.push({
          name: 'blackFrames',
          status: 'fail',
          detail: `${longBlack.length} black segment(s) >= ${blackFailSec}s (e.g. ${longBlack[0].startSec.toFixed(2)}s-${longBlack[0].endSec.toFixed(2)}s) — check for a missing/failed asset in that scene`,
        });
      } else if (blackSegs.length) {
        checks.push({
          name: 'blackFrames',
          status: 'warn',
          detail: `${blackSegs.length} brief black frame(s) under ${blackFailSec}s — likely a scene-cut artifact, not necessarily a defect`,
        });
      } else {
        checks.push({ name: 'blackFrames', status: 'pass', detail: 'none detected' });
      }

      const unsafe = expected.highlights.filter(
        (h) =>
          h.x < margin || h.y < margin || h.x + h.width > 1 - margin || h.y + h.height > 1 - margin,
      );
      if (unsafe.length) {
        checks.push({
          name: 'overlaySafeZone',
          status: 'warn',
          detail: `${unsafe.length} highlight box(es) extend within ${(margin * 100).toFixed(0)}% of an edge — may get cropped on some platforms' UI`,
        });
      } else if (expected.highlights.length) {
        checks.push({
          name: 'overlaySafeZone',
          status: 'pass',
          detail: `${expected.highlights.length} highlight box(es), all within safe margin`,
        });
      }

      if (opts.visionCheck) {
        const vision = await opts.visionCheck(outputId);
        checks.push({
          name: 'visionCheck',
          status: vision.ok ? 'pass' : 'warn',
          detail: vision.notes || (vision.ok ? 'no issues flagged' : 'issue flagged, no notes'),
        });
      }

      const failures = checks.filter((c) => c.status === 'fail');
      const warnings = checks
        .filter((c) => c.status === 'warn')
        .map((c) => `${c.name}: ${c.detail}`);

      if (failures.length) {
        throw new QaFailedError(
          `qa stage failed for output "${outputId}": ${failures
            .map((f) => `${f.name} — ${f.detail}`)
            .join('; ')}`,
        );
      }

      return { outputs: { checks }, warnings };
    },
  };
}
