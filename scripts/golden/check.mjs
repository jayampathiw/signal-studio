#!/usr/bin/env node
// P0.1 — checks a rendered MP4 against a golden.json reference within fixed
// tolerances. Exits 1 with a table on failure; exits 0 silently-ish (one
// summary line) on pass.
import { readFile } from 'node:fs/promises';

import { hammingDistance } from './lib/phash.mjs';
import { measure } from './measure.mjs';

const TOLERANCES = {
  durationSecs: 0.15,
  lufs: 0.5,
  truePeakMax: -1.0,
  sceneCutSecs: 0.2,
  frameHashMaxDistance: 8,
  frameHashMinPassFraction: 0.8, // >= 8/10 frames
};

// Greedily pairs each golden scene-cut timestamp with the closest actual one
// within tolerance, so cuts don't have to land in the same array index.
function matchSceneCuts(actual, golden, toleranceSecs) {
  const unmatched = [...actual];
  const results = [];
  for (const g of golden) {
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < unmatched.length; i++) {
      const delta = Math.abs(unmatched[i] - g);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    const matched = bestIdx !== -1 && bestDelta <= toleranceSecs;
    results.push({
      golden: g,
      actual: bestIdx !== -1 ? unmatched[bestIdx] : null,
      delta: bestDelta,
      pass: matched,
    });
    if (matched) unmatched.splice(bestIdx, 1);
  }
  return results;
}

export function compare(actual, golden) {
  const rows = [];

  const durationDelta = Math.abs(actual.duration - golden.duration);
  rows.push({
    metric: 'duration',
    golden: golden.duration.toFixed(2),
    actual: actual.duration.toFixed(2),
    pass: durationDelta <= TOLERANCES.durationSecs,
  });

  rows.push({
    metric: 'resolution',
    golden: `${golden.width}x${golden.height}`,
    actual: `${actual.width}x${actual.height}`,
    pass: actual.width === golden.width && actual.height === golden.height,
  });

  rows.push({
    metric: 'fps',
    golden: golden.fps.toFixed(2),
    actual: actual.fps.toFixed(2),
    pass: Math.abs(actual.fps - golden.fps) < 0.01,
  });

  const lufsDelta = Math.abs(actual.integratedLufs - golden.integratedLufs);
  rows.push({
    metric: 'integrated LUFS',
    golden: golden.integratedLufs.toFixed(2),
    actual: actual.integratedLufs.toFixed(2),
    pass: lufsDelta <= TOLERANCES.lufs,
  });

  rows.push({
    metric: 'true peak',
    golden: golden.truePeak.toFixed(2),
    actual: actual.truePeak.toFixed(2),
    pass: actual.truePeak <= TOLERANCES.truePeakMax,
  });

  const sceneCutMatches = matchSceneCuts(
    actual.sceneCuts,
    golden.sceneCuts,
    TOLERANCES.sceneCutSecs,
  );
  const sceneCutsPass =
    sceneCutMatches.length === golden.sceneCuts.length && sceneCutMatches.every((m) => m.pass);
  rows.push({
    metric: 'scene cuts',
    golden: `${golden.sceneCuts.length} cuts`,
    actual: `${actual.sceneCuts.length} cuts, ${sceneCutMatches.filter((m) => m.pass).length}/${golden.sceneCuts.length} matched`,
    pass: sceneCutsPass,
  });

  const frameCount = Math.min(actual.frameHashes.length, golden.frameHashes.length);
  let framePasses = 0;
  for (let i = 0; i < frameCount; i++) {
    const dist = hammingDistance(actual.frameHashes[i], golden.frameHashes[i]);
    if (dist <= TOLERANCES.frameHashMaxDistance) framePasses++;
  }
  const frameHashPass =
    frameCount > 0 && framePasses / frameCount >= TOLERANCES.frameHashMinPassFraction;
  rows.push({
    metric: 'frame pHash',
    golden: `${frameCount} frames`,
    actual: `${framePasses}/${frameCount} within distance ${TOLERANCES.frameHashMaxDistance}`,
    pass: frameHashPass,
  });

  const overallPass = rows.every((r) => r.pass);
  return { rows, pass: overallPass };
}

function printTable(rows) {
  const widths = { metric: 16, golden: 24, actual: 40 };
  const line = (m, g, a, ok) =>
    `${ok ? '✓' : '✗'} ${m.padEnd(widths.metric)} golden=${String(g).padEnd(widths.golden)} actual=${a}`;
  for (const r of rows) console.log(line(r.metric, r.golden, r.actual, r.pass));
}

async function main() {
  const [, , mp4Path, goldenPath] = process.argv;
  if (!mp4Path || !goldenPath) {
    console.error('Usage: node scripts/golden/check.mjs <mp4> <golden.json>');
    process.exit(2);
  }
  const golden = JSON.parse(await readFile(goldenPath, 'utf8'));
  const actual = await measure(mp4Path);
  const { rows, pass } = compare(actual, golden);
  printTable(rows);
  if (!pass) {
    console.error(`\nFAIL: ${mp4Path} does not match ${goldenPath}`);
    process.exit(1);
  }
  console.log(`\nPASS: ${mp4Path} matches ${goldenPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
}
