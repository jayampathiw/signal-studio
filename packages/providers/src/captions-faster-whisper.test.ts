import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createFasterWhisperCaptionsProvider } from './captions-faster-whisper.ts';

// Real faster-whisper (real model, real transcription) is exercised
// separately and manually — see this provider's own header + this file's
// footer comment for why a fixture-based automated equivalent isn't viable
// (whisper needs real spoken audio; ffmpeg -f lavfi can't synthesize
// speech, only tones/noise, so a committed synthetic .wav would just
// produce an empty transcript). This test instead verifies the wrapper's
// own logic — argv construction, JSON parsing — against a fake stand-in
// script, same "test what this pass's own code does" scope as
// tts-kokoro-py.test.ts's real-vs-fake split.
async function withFakeScript<T>(fn: (scriptPath: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'captions-fw-test-'));
  const scriptPath = path.join(dir, 'fake_captions.py');
  await writeFile(
    scriptPath,
    [
      '#!/usr/bin/env python3',
      'import json, sys',
      'audio_path = sys.argv[1]',
      "prompt = sys.argv[2] if len(sys.argv) > 2 else ''",
      'print(json.dumps([',
      '  {"text": "seen", "start": 0.0, "end": 0.3, "_audio": audio_path, "_prompt": prompt}',
      ']))',
    ].join('\n'),
  );
  await chmod(scriptPath, 0o755);
  try {
    return await fn(scriptPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('captions-faster-whisper: passes wavPath through, parses JSON output', async () => {
  await withFakeScript(async (scriptPath) => {
    const provider = createFasterWhisperCaptionsProvider({ scriptPath });
    const words = await provider.wordTimings({ wavPath: '/tmp/some.wav' });
    assert.equal(words.length, 1);
    assert.equal(words[0].text, 'seen');
    assert.equal(words[0].start, 0);
    assert.equal(words[0].end, 0.3);
    assert.equal((words[0] as unknown as { _audio: string })._audio, '/tmp/some.wav');
  });
});

test('captions-faster-whisper: hintText is forwarded as the initial_prompt argv', async () => {
  await withFakeScript(async (scriptPath) => {
    // Reuse the fake script above but read its stashed argv back via a
    // second, prompt-echoing script — simpler than parsing stdout for a
    // field the real contract doesn't return.
    const dir = path.dirname(scriptPath);
    const echoScript = path.join(dir, 'echo_prompt.py');
    await writeFile(
      echoScript,
      [
        '#!/usr/bin/env python3',
        'import json, sys',
        'prompt = sys.argv[2] if len(sys.argv) > 2 else None',
        'print(json.dumps([{"text": prompt or "(none)", "start": 0.0, "end": 0.1}]))',
      ].join('\n'),
    );
    const provider = createFasterWhisperCaptionsProvider({ scriptPath: echoScript });
    const words = await provider.wordTimings({ wavPath: '/tmp/some.wav', hintText: 'Octopus' });
    assert.equal(words[0].text, 'Octopus');
  });
});
