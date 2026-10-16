import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests drive the installed Google Chrome (no separate browser download).
 * They start the dev server themselves, or reuse one that is already running on port 5180.
 *
 *   npm run e2e
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5180',
    channel: 'chrome',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
