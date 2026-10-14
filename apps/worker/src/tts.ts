import type { TtsProvider } from '@signal-studio/providers/contracts';
import { createKokoroJsProvider } from '@signal-studio/providers/tts-kokoro-js';
import { createKokoroPyProvider } from '@signal-studio/providers/tts-kokoro-py';

type Synthesise = TtsProvider['synthesise'];

/**
 * Kokoro voice ids start with a language letter (`a` US English, `b` UK
 * English, `f` French, `i` Italian, ...). kokoro-js 1.2.1 only ships the
 * English `a*`/`b*` voices, so any other voice goes to the python Kokoro
 * package already baked into the worker image (`packages/media/tts.py`,
 * which picks its `lang_code` from that same first letter).
 */
export function isKokoroJsVoice(voice: string): boolean {
  return /^[ab][fm]_/.test(voice);
}

export function routeTtsByVoice(js: Synthesise, py: Synthesise): Synthesise {
  return (args) => (isKokoroJsVoice(args.voice) ? js(args) : py(args));
}

export function createRealTts(): Synthesise {
  return routeTtsByVoice(createKokoroJsProvider().synthesise, createKokoroPyProvider().synthesise);
}
