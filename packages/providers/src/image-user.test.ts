import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createUserImageProvider } from './image-user.ts';

test('image-user: resolves a shot id to its pre-uploaded path/url', async () => {
  const provider = createUserImageProvider({
    s1: '/local/still-1.jpg',
    s2: 'https://cdn.example.com/still-2.jpg',
  });

  const local = await provider.generate({ prompt: 's1', aspect: '1:1' });
  assert.deepEqual(local, { path: '/local/still-1.jpg' });

  const remote = await provider.generate({ prompt: 's2', aspect: '1:1' });
  assert.deepEqual(remote, { url: 'https://cdn.example.com/still-2.jpg' });
});

test('image-user: throws a clear error naming the missing shot id', async () => {
  const provider = createUserImageProvider({ s1: '/x.jpg' });
  await assert.rejects(
    () => provider.generate({ prompt: 's99', aspect: '1:1' }),
    /no user-supplied image for shot "s99".*have: s1/,
  );
});
