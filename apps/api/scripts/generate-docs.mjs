// P2.7 — regenerates docs/api.md's embedded OpenAPI JSON from the actual
// Hono route definitions in src/app.ts (via @hono/zod-openapi's app.doc()),
// not hand-written by a person keeping it in sync manually. Run:
//   node --experimental-strip-types apps/api/scripts/generate-docs.mjs
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createApp } from '../src/app.ts';

// Only /openapi.json's route table is static and deps-independent — every
// other route needs real repos to actually run, but generating the doc
// never calls a handler, so these can be inert stand-ins.
const app = createApp({
  jobsRepo: {},
  projectsRepo: {},
  apiKeysRepo: {},
  createStorage: () => ({}),
  dispatcher: { dispatch: async () => {} },
});

const res = await app.request('/openapi.json');
const doc = await res.json();

const routeLines = Object.entries(doc.paths)
  .flatMap(([routePath, methods]) =>
    Object.entries(methods).map(
      ([method, def]) =>
        `| \`${method.toUpperCase()}\` | \`${routePath}\` | ${def.responses ? Object.keys(def.responses).join(', ') : ''} |`,
    ),
  )
  .join('\n');

const markdown = `# signal-studio engine API

> Generated from \`apps/api/src/app.ts\`'s real Hono route definitions via
> \`@hono/zod-openapi\`'s \`app.doc()\` — regenerate with
> \`node --experimental-strip-types apps/api/scripts/generate-docs.mjs\`
> whenever a route changes. Don't hand-edit the JSON block below.

All routes except \`GET /health\` and \`GET /openapi.json\` itself require
\`Authorization: Bearer <api-key>\` (see \`src/middleware/api-key.ts\`).

| Method | Path | Responses |
| --- | --- | --- |
${routeLines}

## Full OpenAPI 3.0 document

\`\`\`json
${JSON.stringify(doc, null, 2)}
\`\`\`
`;

const outPath = path.resolve(import.meta.dirname, '../../../docs/api.md');
await writeFile(outPath, markdown);
console.error(`wrote ${outPath}`);
