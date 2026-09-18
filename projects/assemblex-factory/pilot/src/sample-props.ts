import { buildPostProps } from './build-props';
import { Pack } from './manifest';
import type { PostProps } from './props';
import pack from '../../content/2026-W38/standalone_sample-001/pack.json';

// Wired up for `npm run studio` (P0.8-05) — this is the placeholder pack from
// P0.8-01, served via the public/content symlink. Once the real master-prompt
// pack replaces it (P0.8-01's deferred item), this keeps working unchanged.
const CONTENT_BASE = 'content/2026-W38/standalone_sample-001';

export const sampleProps: PostProps = buildPostProps(
  Pack.parse(pack),
  CONTENT_BASE,
  'fb',
  'AssembleX Factory',
);
