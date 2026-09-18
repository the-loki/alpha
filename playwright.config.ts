import { defineConfig } from '@playwright/test'

/**
 * The window seam: real Electron, the real built bundle, no mocks. Each test gets its own app
 * data directory so a run never touches the developer's own workbench state.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
})
