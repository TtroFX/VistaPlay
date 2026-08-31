import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /browser-smoke\.spec\.mjs/,
  timeout: 45_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
