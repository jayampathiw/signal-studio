// Portrait (9:16) caption band tops, as fractions of the frame height. Pure
// so auto-zoom.ts and its tests share them with CaptionLayer.tsx.
//
// Document and footage scenes: 55%, above the zone platform chrome covers on
// a native 9:16 post (username, caption text, "See more" — Video #2 review)
// and high enough to stay readable; auto-zoom frames highlights above it.
// Lokken (Nov 15) insights: viewers are mostly 55+ and the old 74% band sat
// on the highlighted line.
export const CAPTION_TOP_DOCUMENT = 0.55;
// Data cards (counter, chart, pointer card) centre their content, which
// reaches past 55%, so their captions stay low, in the empty lower third.
export const CAPTION_TOP_CARD = 0.74;
