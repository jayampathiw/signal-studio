import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { createElevenLabsProvider } from './tts-elevenlabs.ts';

const execFileAsync = promisify(execFile);

async function makeRealMp3Bytes(): Promise<ArrayBuffer> {
  // A real, tiny MP3 (0.2s of silence via ffmpeg) — so this provider's real
  // `ffprobe` duration call has something genuine to measure, not garbage
  // bytes. No real ElevenLabs key exists in this environment (unverified,
  // same honest flag as tts-elevenlabs.ts's own header), so the HTTP layer
  // is mocked; the ffprobe step downstream of it is real.
  const { readFile, writeFile, mkdtemp, rm: rmDir } = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'elevenlabs-fixture-'));
  const file = path.join(dir, 'silence.mp3');
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=22050:cl=mono',
    '-t',
    '0.2',
    file,
  ]);
  const bytes = await readFile(file);
  await rmDir(dir, { recursive: true, force: true });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test('tts-elevenlabs: posts text/model/speed, writes the audio, measures real duration', async (t) => {
  const mp3Bytes = await makeRealMp3Bytes();
  let capturedUrl: string | undefined;
  let capturedBody: any;
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init!.body as string);
    return new Response(mp3Bytes, { status: 200 });
  });

  const provider = createElevenLabsProvider({ apiKey: 'test-key' });
  const result = await provider.synthesise({
    text: 'hello octopus',
    voice: 'voice-123',
    speed: 1.1,
  });

  assert.ok(capturedUrl?.includes('/text-to-speech/voice-123'));
  assert.equal(capturedBody.text, 'hello octopus');
  assert.equal(capturedBody.voice_settings.speed, 1.1);
  assert.ok(result.durationSec > 0);

  await rm(result.wavPath, { force: true });
});

test('tts-elevenlabs: throws with the API error on a non-OK response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('quota exceeded', { status: 429 }));
  const provider = createElevenLabsProvider({ apiKey: 'test-key' });
  await assert.rejects(
    () => provider.synthesise({ text: 'x', voice: 'v', speed: 1 }),
    /ElevenLabs TTS failed \(429\)/,
  );
});

test('createElevenLabsProvider: throws immediately with no API key available', () => {
  const prev = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    assert.throws(() => createElevenLabsProvider(), /missing ELEVENLABS_API_KEY/);
  } finally {
    if (prev !== undefined) process.env.ELEVENLABS_API_KEY = prev;
  }
});
