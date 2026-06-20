import { config as loadDotenv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { schema } from './schema.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = resolve(repoRoot, '.env');

if (existsSync(envPath)) {
  loadDotenv({ path: envPath });
}

const missing = schema.required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}\nCopy .env.example → .env and fill in values.`);
}

export const env = new Proxy(process.env, {
  get(target, key) {
    return target[key];
  },
});
