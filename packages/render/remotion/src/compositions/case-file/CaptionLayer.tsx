import { loadFont } from '@remotion/google-fonts/PTSerif';
import type { CaptionWord } from '@signal-studio/types/timeline';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import { PALETTE } from './palette';

const { fontFamily } = loadFont();

type Props = {
  text?: string;
  words?: CaptionWord[] | null;
};

// "Highlighter Sweep" — phrase-chunked, not the whole sentence at once. Round-3
// feedback: the full-sentence transcript (needed so the highlight always matches
// the real spoken word) read as too small/too much text at once for an older
// audience on a small screen. Fixed by keeping the accurate transcript as the data
// source, but displaying it a few words at a time (~4 words per chunk, timed to
// when those words are actually spoken) at a much larger font — each chunk fades
// in as its time window starts and is replaced by the next, rather than holding
// the entire sentence on screen throughout the scene.
const CHUNK_SIZE = 4;
const STROKE =
  '-2px -2px 0 #0b1620, 2px -2px 0 #0b1620, -2px 2px 0 #0b1620, 2px 2px 0 #0b1620, 0 0 8px rgba(0,0,0,0.9)';

type Word = { text: string; start: number; end: number };

function chunkWords(words: Word[]): Word[][] {
  const chunks: Word[][] = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) chunks.push(words.slice(i, i + CHUNK_SIZE));
  return chunks;
}

// Lines within a chunk are pre-wrapped in JS, not left to the browser's live
// reflow — a long-caption Chromium rendering bug (confirmed via raw Remotion
// stills) showed a faint ghost of the next line's first word when wrap points
// shifted frame-to-frame as the highlighted word's padding changed its width.
// Pre-computed breaks keep the wrap position constant for as long as a chunk is
// shown, so there's nothing to reflow.
function wrapLines(words: Word[], charsPerLine: number): number[][] {
  const lines: number[][] = [];
  let current: number[] = [];
  let currentLen = 0;
  words.forEach((w, i) => {
    const wordLen = w.text.length;
    if (current.length > 0 && currentLen + 1 + wordLen > charsPerLine) {
      lines.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(i);
    currentLen += (current.length > 1 ? 1 : 0) + wordLen;
  });
  if (current.length > 0) lines.push(current);
  return lines;
}

// Captions anchor to a fixed band starting at 74% down the frame, not to the
// bottom edge — but ONLY on portrait (9:16) renders. Video #2 review found
// bottom-anchored captions land in the same zone platform chrome overlays on a
// native 9:16 post (username/caption text, "See more") — see temp/The Policy
// File — Video #2 Production Script/Untitled.png. 74% clears that chrome while
// staying below the mostly-empty lower third those portrait scenes (counter,
// chart) leave below their content.
//
// On landscape (16:9) documentary renders this same fixed band lands mid-page —
// a zoomed document fills nearly the whole frame there, so 74% down sits on top
// of the highlighted evidence text itself (confirmed via Video #2 render:
// mamboleo-pacific-life-settlement, scenes s1/s3/s5b). There's no platform-chrome
// overlap risk on a 16:9 landscape post either, so landscape keeps the original
// bottom-anchored layout instead of the fixed band.
const CAPTION_TOP_FRACTION = 0.74;

export const CaptionLayer: React.FC<Props> = ({ text, words }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!text) return null;

  const allWords: Word[] =
    words && words.length > 0
      ? words
      : text.split(/\s+/).map((w) => ({ text: w, start: 0, end: 0 }));
  const chunks = chunkWords(allWords);
  const t = frame / fps;

  // The chunk whose first word has already started (by playback time) is the
  // active one — it stays on screen until the next chunk's start time.
  let chunkIdx = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (t >= chunks[i][0].start) chunkIdx = i;
    else break;
  }
  const chunk = chunks[chunkIdx];
  const chunkStartFrame = chunk[0].start * fps;

  const opacity = interpolate(frame, [chunkStartFrame, chunkStartFrame + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateY = interpolate(frame, [chunkStartFrame, chunkStartFrame + 8], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Sticky selection: the highlight follows the last word whose start time has
  // passed, not a strict start<=t<end window. Whisper word timings frequently
  // leave small gaps between words (end of word A before start of word B) —
  // with a strict window, playback landing in that gap left no word
  // highlighted at all. Sticky selection means exactly one word is always lit
  // while a chunk is on screen, matching what the user actually hears.
  let activeIndex = -1;
  for (let i = 0; i < chunk.length; i++) {
    if (t >= chunk[i].start) activeIndex = i;
    else break;
  }

  // Only ~4 short words on screen at once, so a much bigger font than a
  // full-sentence caption could ever safely use — sized for legibility on a small
  // phone screen for an older audience, per direct review feedback.
  const chunkText = chunk.map((w) => w.text).join(' ');
  const fontSize = chunkText.length > 34 ? 46 : chunkText.length > 22 ? 54 : 62;

  const availableWidth = width * 0.94 - 96;
  const charsPerLine = Math.max(8, Math.floor(availableWidth / (fontSize * 0.56)));
  const lines = wrapLines(chunk, charsPerLine);

  const isPortrait = height > width;

  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={
          isPortrait
            ? {
                position: 'absolute',
                top: height * CAPTION_TOP_FRACTION,
                left: 0,
                right: 0,
                padding: '0 48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity,
                transform: `translateY(${translateY}px)`,
              }
            : {
                position: 'absolute',
                bottom: 72,
                left: 0,
                right: 0,
                padding: '0 48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                opacity,
                transform: `translateY(${translateY}px)`,
              }
        }
      >
        {lines.map((line, lineIdx) => (
          <p
            key={lineIdx}
            style={{
              fontFamily,
              fontWeight: 700,
              fontSize,
              lineHeight: 1.35,
              margin: 0,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {line.map((i, k) => (
              <span key={i}>
                <span
                  style={{
                    display: 'inline-block',
                    color: i === activeIndex ? PALETTE.background : PALETTE.paper,
                    background: i === activeIndex ? PALETTE.highlight : 'transparent',
                    boxShadow: i === activeIndex ? '0 2px 10px rgba(0,0,0,0.55)' : 'none',
                    textShadow: i === activeIndex ? 'none' : STROKE,
                    borderRadius: 6,
                    padding: i === activeIndex ? '3px 12px' : '2px 0',
                  }}
                >
                  {chunk[i].text}
                </span>
                {k < line.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>
        ))}
      </div>
    </AbsoluteFill>
  );
};
