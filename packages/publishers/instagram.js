import { env } from '@signal-studio/config';

// TODO: implement Instagram Graph API publish (deferred — pages not yet created)
// Reference: reels-pipeline/src/services/publishers/instagram.js

export async function postToInstagram(pageKey, content) {
  throw new Error('Instagram publish not yet implemented. Deferred until pages are created.');
}
