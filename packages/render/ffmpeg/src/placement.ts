// P3.1 — moved from apps/video/src/longform/placement.js, retyped
// (behavior-preserving mechanical port). Named drawtext placement anchors +
// a keyword matcher mapping a scene's human-written placement description
// (e.g. "lower-right dark void beside the gloves") to the nearest one.
// Deliberately NOT image-content-aware — see the original file's own header
// for why (a human review pass should check each choice against the real
// image before final render).
const PAD = 0.06;

export const ANCHORS = {
  upper_left: { x: `w*${PAD}`, y: `h*0.10` },
  upper_center: { x: `(w-text_w)/2`, y: `h*0.10` },
  upper_right: { x: `w-text_w-w*${PAD}`, y: `h*0.10` },
  left_mid: { x: `w*${PAD}`, y: `(h-text_h)/2` },
  right_mid: { x: `w-text_w-w*${PAD}`, y: `(h-text_h)/2` },
  center_low: { x: `(w-text_w)/2`, y: `h*0.60` },
  lower_left: { x: `w*${PAD}`, y: `h*0.80` },
  lower_center: { x: `(w-text_w)/2`, y: `h*0.80` },
  lower_right: { x: `w-text_w-w*${PAD}`, y: `h*0.80` },
} as const;

export type AnchorName = keyof typeof ANCHORS;

export const DEFAULT_ANCHOR: AnchorName = 'lower_center';

// Order matters — more specific compound phrases must be tested before the
// generic single-direction fallbacks below them.
const KEYWORD_RULES: Array<{ re: RegExp; anchor: AnchorName }> = [
  { re: /center.?[- ]?low/i, anchor: 'center_low' },
  { re: /(lower|bottom).?[- ]?left/i, anchor: 'lower_left' },
  { re: /(lower|bottom).?[- ]?right/i, anchor: 'lower_right' },
  { re: /(upper|top).?[- ]?left/i, anchor: 'upper_left' },
  { re: /(upper|top).?[- ]?right/i, anchor: 'upper_right' },
  { re: /bottom third|lower third|lower.?center/i, anchor: 'lower_center' },
  { re: /upper.?center|upper sky|sky area|far distant/i, anchor: 'upper_center' },
  { re: /left third|\bleft\b/i, anchor: 'left_mid' },
  { re: /right third|\bright\b/i, anchor: 'right_mid' },
  { re: /\b(upper|top)\b/i, anchor: 'upper_center' },
  { re: /\b(lower|bottom)\b/i, anchor: 'lower_center' },
  { re: /\bsky\b|\babove\b/i, anchor: 'upper_center' },
];

export type Placement = { anchor: AnchorName; x: string; y: string; matched: boolean };

export function resolvePlacement(freeText?: string | null): Placement {
  if (freeText) {
    for (const rule of KEYWORD_RULES) {
      if (rule.re.test(freeText)) {
        return { anchor: rule.anchor, ...ANCHORS[rule.anchor], matched: true };
      }
    }
  }
  return { anchor: DEFAULT_ANCHOR, ...ANCHORS[DEFAULT_ANCHOR], matched: false };
}
