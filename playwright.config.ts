import { defineConfig } from '@playwright/test'

/**
 * The window seam: real Electron, the real built bundle, no mocks. Each test gets its own app
 * data directory so a run never touches the developer's own workbench state.
 *
 * The directories are mkdtemp's, under `/tmp`, and nothing removed them — 27,000 of them
 * accumulated here before the disk noticed. One test's data is never another test's business
 * (each names its own), so sweeping them at the end of a run is safe, and it is the only place
 * a sweep can live: the tests themselves have no "after everything".
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  globalTeardown: './e2e/global-teardown.ts',
})
