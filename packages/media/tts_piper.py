#!/usr/bin/env python3
"""
Piper TTS wrapper — called by packages/media/tts.js via child_process.
Usage: python3 tts_piper.py "<text>" <output.wav> <model.onnx>
"""
import sys
import wave
from piper import PiperVoice

def main():
    if len(sys.argv) < 4:
        print("Usage: tts_piper.py <text> <output_path> <model_path>", file=sys.stderr)
        sys.exit(1)

    text, output_path, model_path = sys.argv[1], sys.argv[2], sys.argv[3]

    voice = PiperVoice.load(model_path)
    with wave.open(output_path, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)

if __name__ == "__main__":
    main()
