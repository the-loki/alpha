import { defineConfig } from 'vitest/config'

/**
 * Two suites, two runners: everything here runs in Node with no Electron, `e2e/` belongs to
 * Playwright and launches the built app. Keeping the e2e directory out of this config is what
 * stops `pnpm test` from trying to run a Playwright spec.
 */
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      // Design-system checks read the repository rather than a package, so they live in tools/.
      'tools/**/*.test.{mjs,ts}',
      'tools/**/__fixtures__/**/*.test.mjs',
    ],
    exclude: ['**/node_modules/**', 'out/**', 'e2e/**', 'test-results/**'],
    environment: 'node',
    reporters: ['default'],
  },
})
