#!/usr/bin/env python3
"""Generate TTS audio via kokoro_onnx. Args: text voice output_path [speed]

Shares the Kokoro install at the shared path below. If you move the install
location, update both MODEL and VOICES paths.
"""
import sys
import soundfile as sf
from kokoro_onnx import Kokoro

MODEL  = '/home/jayam/projects/shared/kokoro-tts/kokoro-v1.0.onnx'
VOICES = '/home/jayam/projects/shared/kokoro-tts/voices-v1.0.bin'

if len(sys.argv) < 4:
    print('Usage: tts.py <text> <voice> <output_path> [speed]', file=sys.stderr)
    sys.exit(1)

text        = sys.argv[1]
voice       = sys.argv[2]
output_path = sys.argv[3]
speed       = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0

k = Kokoro(MODEL, VOICES)
samples, sample_rate = k.create(text, voice=voice, speed=speed)
sf.write(output_path, samples, sample_rate)
print(f'[tts] wrote {output_path} ({sample_rate}Hz, {len(samples)/sample_rate:.1f}s)')
