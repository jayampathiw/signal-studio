import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickTrack } from './pick.ts';
import { MusicLibrary, musicTrackKey } from '../schemas/music-library.v1.ts';

const library = MusicLibrary.parse({
  version: 1,
  tracks: [
    {
      id: 'tension-01',
      file: 'tension-01.mp3',
      source: 'pixabay',
      licence: 'pixabay-content-license',
      moods: ['tension'],
    },
    {
      id: 'tension-02',
      file: 'tension-02.mp3',
      source: 'pixabay',
      licence: 'pixabay-content-license',
      moods: ['tension'],
    },
    {
      id: 'hope-01',
      file: 'hope-01.mp3',
      source: 'pixabay',
      licence: 'pixabay-content-license',
      moods: ['hope'],
    },
    {
      id: 'meta-calm-01',
      file: 'meta-calm-01.mp3',
      source: 'meta-sound-collection',
      licence: 'meta-sound-collection',
      platforms: ['facebook', 'instagram'],
      moods: ['calm'],
    },
    {
      id: 'off-01',
      file: 'off-01.mp3',
      source: 'pixabay',
      licence: 'pixabay-content-license',
      moods: ['tension'],
      enabled: false,
    },
  ],
});

test('pickTrack: same job id always gets the same track', () => {
  const a = pickTrack(library, { jobId: 'job-abc', platforms: ['facebook'] });
  const b = pickTrack(library, { jobId: 'job-abc', platforms: ['facebook'] });
  assert.ok(a.track);
  assert.equal(a.track?.id, b.track?.id);
});

test('pickTrack: different jobs spread across candidates', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) {
    ids.add(
      pickTrack(library, { jobId: `job-${i}`, platforms: ['facebook'], mood: 'tension' }).track!.id,
    );
  }
  assert.deepEqual([...ids].sort(), ['tension-01', 'tension-02']);
});

test('pickTrack: mood narrows the pool, and widens back when nothing matches', () => {
  const hope = pickTrack(library, { jobId: 'j', platforms: ['facebook'], mood: 'hope' });
  assert.equal(hope.track?.id, 'hope-01');
  assert.equal(hope.track && 'moodMatched' in hope && hope.moodMatched, true);

  const unknown = pickTrack(library, { jobId: 'j', platforms: ['facebook'], mood: 'jazz' });
  assert.ok(unknown.track);
  assert.equal('moodMatched' in unknown && unknown.moodMatched, false);
});

test('pickTrack: a FB/IG-only track is never picked for a job that also goes to YouTube', () => {
  for (let i = 0; i < 50; i++) {
    const r = pickTrack(library, {
      jobId: `job-${i}`,
      platforms: ['facebook', 'youtube'],
      mood: 'calm',
    });
    assert.notEqual(r.track?.id, 'meta-calm-01');
  }
  const fbOnly = pickTrack(library, {
    jobId: 'j',
    platforms: ['facebook', 'instagram'],
    mood: 'calm',
  });
  assert.equal(fbOnly.track?.id, 'meta-calm-01');
});

test('pickTrack: disabled tracks are never picked', () => {
  for (let i = 0; i < 50; i++) {
    assert.notEqual(pickTrack(library, { jobId: `job-${i}`, platforms: [] }).track?.id, 'off-01');
  }
});

test('pickTrack: brand.musicBeds limits the pool; no candidates returns a reason', () => {
  const r = pickTrack(library, { jobId: 'j', platforms: ['facebook'], allowedIds: ['hope-01'] });
  assert.equal(r.track?.id, 'hope-01');

  const none = pickTrack(library, {
    jobId: 'j',
    platforms: ['youtube'],
    allowedIds: ['meta-calm-01'],
  });
  assert.equal(none.track, undefined);
  assert.match('reason' in none ? none.reason : '', /no enabled track/);

  const empty = pickTrack(MusicLibrary.parse({ version: 1, tracks: [] }), {
    jobId: 'j',
    platforms: [],
  });
  assert.match('reason' in empty ? empty.reason : '', /empty/);
});

test('MusicLibrary: rejects duplicate ids and bad id characters; musicTrackKey keeps the extension', () => {
  const dup = MusicLibrary.safeParse({
    version: 1,
    tracks: [
      { id: 'a', file: 'a.mp3', source: 'pixabay', licence: 'x' },
      { id: 'a', file: 'b.mp3', source: 'pixabay', licence: 'x' },
    ],
  });
  assert.equal(dup.success, false);
  assert.equal(
    MusicLibrary.safeParse({
      version: 1,
      tracks: [{ id: 'Bad Id', file: 'a.mp3', source: 'pixabay', licence: 'x' }],
    }).success,
    false,
  );
  assert.equal(musicTrackKey({ id: 'hope-01', file: 'Hope_Relief.MP3' }), 'music/hope-01.mp3');
});
