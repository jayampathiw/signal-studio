// The Policy File — case assembler. File-driven, mirrors
// apps/video/scripts/longform/assemble-local.mjs's convention (a project directory
// of files, no content_clips/content_stills rows — this channel is single-author
// manual work, not parallel generation, so that machinery isn't needed).
//
// Reads content/policy-file/<case-slug>/case.json + documents/ + vo/, synthesizes
// any missing per-scene narration via Kokoro, builds a Timeline (template:
// 'case-file') and renders it through the CaseFile Remotion composition.
//
// Scene duration is DERIVED FROM THE ACTUAL NARRATION AUDIO, not authored in
// case.json — an authored guess reliably produces either dead air (guess too long)
// or a hard cut mid-sentence (guess too short, since Sequence clips its children at
// the scene boundary). case.json's `durationSecs` is only a fallback for a scene
// with no narration at all (e.g. a silent connective beat).
//
// Caption text + word timing ("Highlighter Sweep" style, CaptionLayer.tsx) come
// directly from Whisper's own transcription of the narration audio (packages/media/
// subtitles.js) — the on-screen line IS what Whisper heard, word-for-word, not a
// separately-authored caption aligned onto it after the fact. Earlier attempts
// tried to align an authored `captionText` (a paraphrase of `narrationText`, often
// quite different) onto the narration's real timestamps — that's structurally
// unfixable: if the displayed word isn't the word being said, no alignment
// algorithm can make the highlight land on "what's actually being said," because
// the text and the audio just don't agree. Using the transcript itself as truth
// makes the highlight-to-word correspondence exact by construction.
//
// Usage (--experimental-strip-types is required: @signal-studio/render-remotion's
// entry point is TypeScript with no separate build step):
//   node --experimental-strip-types apps/video/scripts/policy-file/assemble-case.mjs --dir content/policy-file/<case-slug>
// or: pnpm --filter @signal-studio/video assemble-case -- --dir content/policy-file/<case-slug>

import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

import { generateWordTimestamps } from '@signal-studio/media/subtitles';
import { synthesise } from '@signal-studio/media/tts';
import { render } from '@signal-studio/render-core';

import { getChannel } from '../../src/config/channels.js';
import '@signal-studio/render-remotion'; // side-effect: registers the 'remotion' engine

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const DEFAULT_CHANNEL_KEY = 'policy-file/case-file/EN';

// Trailing breathing room after narration ends before the scene cuts — small enough
// not to read as a gap, generous enough not to feel like a hard cut.
const TAIL_PADDING_SECS = 0.5;

function probeDuration(filePath) {
  return Number(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, {
      encoding: 'utf-8',
    }).trim(),
  );
}

// Turns Whisper's raw word list into the CaptionLayer word-timing shape, and joins
// the same words into the literal line that gets displayed — so the rendered
// caption text and the highlight timing are derived from the same source and can
// never disagree with each other or with what the narration audio actually says.
function transcriptToWords(whisperWords) {
  return whisperWords.map((w) => ({ text: w.word, start: w.start, end: w.end }));
}

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
  },
  strict: false,
});

if (!values.dir) {
  console.error('--dir <project-dir> required, e.g. content/policy-file/case-001-denied-claim');
  process.exit(2);
}

const projectDir = resolve(REPO_ROOT, values.dir);
const casePath = join(projectDir, 'case.json');
const documentsDir = join(projectDir, 'documents');
const voDir = join(projectDir, 'vo');
const outputDir = join(projectDir, 'output');

if (!existsSync(casePath)) {
  console.error(`case.json not found at ${casePath}`);
  process.exit(1);
}

const caseData = JSON.parse(await readFile(casePath, 'utf-8'));
const channel = getChannel(caseData.channelKey ?? DEFAULT_CHANNEL_KEY);
mkdirSync(voDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

// imagePath omitted -> CaseFile.tsx carries the previous scene's document forward
// (never renders blank), so the loader doesn't need to resolve continuity itself.
const scenes = [];
for (const scene of caseData.scenes) {
  let source;
  if (scene.imagePath) {
    const imagePath = join(documentsDir, scene.imagePath);
    if (!existsSync(imagePath)) {
      console.error(`Missing document image for scene ${scene.id}: ${imagePath}`);
      process.exit(1);
    }
    source = { localPath: imagePath, type: 'image' };
  }

  const narrationPath = join(voDir, `${scene.id}.wav`);
  const narrationText = scene.narrationText ?? scene.captionText;
  if (!existsSync(narrationPath) && narrationText) {
    console.log(`Synthesising narration for ${scene.id}...`);
    await synthesise(narrationText, narrationPath, {
      voice: channel.voice,
      speed: channel.voiceSpeed,
    });
  }

  const hasNarration = existsSync(narrationPath);
  const durationSecs = hasNarration
    ? probeDuration(narrationPath) + TAIL_PADDING_SECS + (scene.holdExtraSecs ?? 0)
    : (scene.durationSecs ?? 3);

  // The on-screen caption is the actual transcript of the narration audio (what
  // Whisper heard), not the authored captionText/narrationText — TTS output can
  // drift slightly from the script (dropped words, different contractions), and a
  // separately-authored caption line can never be guaranteed to match word-for-word.
  // Using the transcript itself as the caption is the only way the highlighted word
  // is always genuinely the word being spoken. scene.captionText is still used as a
  // static fallback for a scene with no narration at all.
  let words = null;
  let captionText = scene.captionText;
  if (hasNarration) {
    console.log(`Transcribing narration for ${scene.id}...`);
    const wordsJsonPath = join(voDir, `${scene.id}.words.json`);
    const whisperWords = await generateWordTimestamps(narrationPath, wordsJsonPath, narrationText);
    words = transcriptToWords(whisperWords);
    if (words.length > 0) captionText = words.map((w) => w.text).join(' ');
  }

  // Highlight timing can be authored as absolute fromSec/toSec, or as
  // fromFraction/toFraction (0-1 of the scene) — fractions are resolved against the
  // *measured* duration here, since the authored durationSecs above is only a guess
  // until the audio exists.
  const resolveHighlight = (h) =>
    h && (h.fromFraction != null || h.toFraction != null)
      ? {
          ...h,
          fromSec: (h.fromFraction ?? 0) * durationSecs,
          toSec: (h.toFraction ?? 1) * durationSecs,
        }
      : h;

  // `highlights` (an array) is the general case — sequential evidence beats shown
  // one at a time within the same scene. `highlight` (singular) is kept as shorthand
  // for the common one-beat-per-scene case; when both are absent this resolves to [].
  const highlights = scene.highlights
    ? scene.highlights.map(resolveHighlight)
    : scene.highlight
      ? [resolveHighlight(scene.highlight)]
      : [];

  scenes.push({
    id: scene.id,
    durationSecs,
    source,
    narrationPath: hasNarration ? narrationPath : undefined,
    captionText,
    words,
    highlights,
    zoomFrom: scene.zoomFrom,
    zoomTo: scene.zoomTo,
    visual: scene.visual,
    waveformOverlay: scene.waveformOverlay,
  });
}

const watermarkPath = resolve(REPO_ROOT, 'assets/logos', channel.watermarkFile);
const timeline = {
  contentId: caseData.caseId,
  aspectRatio: channel.aspectRatio,
  template: 'case-file',
  caseMeta: {
    caseId: caseData.caseId,
    // hideSourceOnScreen keeps the citation OUT of the render (per-format choice,
    // e.g. Data Visualization drops on-screen source cards for pacing) while
    // register-case.mjs still reads caseData.sourceCitation directly for the
    // published video's description/caption — the two are independent by design.
    sourceCitation: caseData.hideSourceOnScreen ? undefined : caseData.sourceCitation,
    specimen: caseData.specimen ?? false,
    showOutro: caseData.showOutro ?? true,
  },
  watermark: { path: watermarkPath, position: 'bottom-right', opacity: 0.9 },
  scenes,
};

console.log(
  `Rendering ${caseData.caseId} (${scenes.length} scenes, total ${scenes.reduce((s, sc) => s + sc.durationSecs, 0).toFixed(1)}s)...`,
);
const outputPath = await render(timeline, { engine: 'remotion', outputDir });
console.log(`Rendered: ${outputPath}`);
