import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import yaml from 'js-yaml';
import { Project } from '@signal-studio/core/schemas';

import { createEngineClient } from '../src/client.ts';
import { OrgsRepo, ProjectsRepo } from '../src/repos/index.ts';

/**
 * Seeds org 1 + whatever `project.yaml` files (matching the project.v1
 * schema) it finds under --dir. The plan (§10 P1.5) says "the four projects
 * from project.yaml files" — as of this commit only one project.yaml exists
 * in the repo (projects/assemblex-factory/project.yaml), and its shape is
 * the pilot bridge's own ad-hoc {voice, speed, music_gain_db, watermark_text}
 * config, not a project.v1 shape (no slug/orgId/defaults/providers). Rather
 * than fabricate the other three or force-convert a mismatched file, this
 * script only seeds files that actually validate against Project, and warns
 * about anything else it finds. Real seed data lands once the workspace
 * repo (P0.4+) has real project.yaml files in the project.v1 shape.
 */

async function findProjectYamlFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findProjectYamlFiles(full)));
    } else if (entry.name === 'project.yaml') {
      found.push(full);
    }
  }
  return found;
}

async function main() {
  const dir = process.argv[2] ?? path.resolve(import.meta.dirname, '..', '..', '..', 'projects');
  const client = createEngineClient();
  const orgs = new OrgsRepo(client);
  const projects = new ProjectsRepo(client);

  const org = (await orgs.getBySlug('org-1')) ?? (await orgs.create('org-1', 'Org 1'));
  console.log(`Org: ${org.slug} (${org.id})`);

  const files = await findProjectYamlFiles(dir);
  let seeded = 0;
  for (const file of files) {
    const raw = yaml.load(await readFile(file, 'utf8'));
    const result = Project.safeParse(raw);
    if (!result.success) {
      console.error(`Skipping ${file} — does not match project.v1 schema:`);
      for (const issue of result.error.issues)
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      continue;
    }
    await projects.upsert(org.id, result.data.slug, result.data);
    console.log(`Seeded project: ${result.data.slug}`);
    seeded += 1;
  }

  console.log(`\n${seeded}/${files.length} project.yaml file(s) seeded.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
