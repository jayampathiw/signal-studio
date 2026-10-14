import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { zodToJsonSchema } from 'zod-to-json-schema';

import { Manifest } from '../src/schemas/manifest.v1.ts';
import { Project } from '../src/schemas/project.v1.ts';
import { Timeline } from '../src/schemas/timeline.v1.ts';

const OUT_DIR = path.resolve(import.meta.dirname, '..', '..', '..', 'docs', 'schemas');

const SCHEMAS: Record<string, unknown> = {
  'manifest.v1': Manifest,
  'project.v1': Project,
  'timeline.v1': Timeline,
};

await mkdir(OUT_DIR, { recursive: true });

for (const [name, schema] of Object.entries(SCHEMAS)) {
  const jsonSchema = zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], name);
  const outPath = path.join(OUT_DIR, `${name}.json`);
  await writeFile(outPath, JSON.stringify(jsonSchema, null, 2) + '\n');
  console.log(`Wrote ${path.relative(process.cwd(), outPath)}`);
}
