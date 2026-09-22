// Shared between Compilation.tsx and TitlePlate.tsx — split out to avoid a
// circular import between the two (Compilation renders TitlePlate; TitlePlate
// needs this constant for its own fade-out timing).
export const CROSSFADE_FRAMES = 6;
