import { defineConfig } from 'vitest/config';

// Root vitest project for packages/apps that don't run their own test
// runner (dashboard uses `ng test`; the pilot bridge uses `node --test` —
// both keep their own `test` script and are excluded here).
export default defineConfig({
  test: {
    include: ['{apps,packages,scripts}/**/*.{test,spec}.{js,ts}'],
    exclude: ['**/node_modules/**', 'apps/dashboard/**', 'projects/**'],
    environment: 'node',
    // No package has a vitest-based test yet (pilot uses node:test; dashboard
    // uses ng test) — this becomes real once P1+ adds packages/core tests.
    passWithNoTests: true,
  },
});
