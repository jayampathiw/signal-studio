// Named drawtext placement anchors + a keyword matcher that maps a scene's
// human-written placement description (e.g. "lower-right dark void beside the
// gloves") to the nearest one. This is deliberately NOT image-content-aware —
// it doesn't look at the actual rendered still — so a human review pass should
// check each anchor choice against the real image before final render (see
// content/longform/son-also-saves/placement_overrides.json).
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
};

export const DEFAULT_ANCHOR = 'lower_center';

// Order matters — more specific compound phrases must be tested before the
// generic single-direction fallbacks below them.
const KEYWORD_RULES = [
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

export function resolvePlacement(freeText) {
  if (freeText) {
    for (const rule of KEYWORD_RULES) {
      if (rule.re.test(freeText)) {
        return { anchor: rule.anchor, ...ANCHORS[rule.anchor], matched: true };
      }
    }
  }
  return { anchor: DEFAULT_ANCHOR, ...ANCHORS[DEFAULT_ANCHOR], matched: false };
}
