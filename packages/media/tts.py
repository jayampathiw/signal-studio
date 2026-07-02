#!/usr/bin/env python3
"""
Kokoro TTS wrapper — called by packages/media/tts.js via child_process.
Usage: python3 tts.py "<text>" <output.wav> <voice_id> <speed>
"""
import sys
import numpy as np
import soundfile as sf
from kokoro import KPipeline

# Kokoro lang_code is the first letter of the voice_id prefix
# af_bella → 'a' (American English), if_sara → 'i' (Italian), ff_siwis → 'f' (French)
def lang_from_voice(voice_id):
    return voice_id[0] if voice_id else 'a'

def main():
    if len(sys.argv) < 5:
        print("Usage: tts.py <text> <output_path> <voice_id> <speed>", file=sys.stderr)
        sys.exit(1)

    text, output_path, voice_id, speed = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])

    pipeline = KPipeline(lang_code=lang_from_voice(voice_id))
    chunks = [audio for _, _, audio in pipeline(text, voice=voice_id, speed=speed)]

    audio = np.concatenate(chunks) if chunks else np.zeros(24000, dtype=np.float32)
    sf.write(output_path, audio, 24000)

if __name__ == "__main__":
    main()
