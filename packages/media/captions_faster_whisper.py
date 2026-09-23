#!/usr/bin/env python3
"""
faster-whisper word-timing extractor — called by
packages/providers/src/captions-faster-whisper.ts via child_process.
Usage: python3 captions_faster_whisper.py <audio.wav> [initial_prompt]
Prints a JSON array of {text, start, end} to stdout.
"""
import json
import sys

from faster_whisper import WhisperModel

_MODEL_SIZE = "tiny"


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: captions_faster_whisper.py <audio_path> [initial_prompt]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    initial_prompt = sys.argv[2] if len(sys.argv) > 2 else None

    model = WhisperModel(_MODEL_SIZE, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(
        audio_path,
        word_timestamps=True,
        initial_prompt=initial_prompt,
    )

    words = []
    for segment in segments:
        for word in segment.words or []:
            words.append(
                {"text": word.word.strip(), "start": word.start, "end": word.end}
            )

    print(json.dumps(words))


if __name__ == "__main__":
    main()
