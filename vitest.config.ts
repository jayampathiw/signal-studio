import { defineConfig } from 'vitest/config';

// Root vitest project for packages/apps that don't run their own test
// runner. Everything under packages/ currently uses node's built-in test
// runner instead (node:test — same convention the pilot bridge established
// in P0.8), each with its own package.json `test` script run separately by
// the root `test` script; vitest would "pass" those files with 0 tests
// found (they don't call vitest's own test()), which is silent and
// misleading, so they're excluded here rather than double-run.
export default defineConfig({
  test: {
    include: ['{apps,scripts}/**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', 'apps/dashboard/**', 'projects/**'],
    environment: 'node',
    // No package in vitest's own scope has a test yet (dashboard uses
    // ng test; everything else uses node:test) — becomes real once
    // apps/news or apps/video gets its first vitest-based test.
    passWithNoTests: true,
  },
});
