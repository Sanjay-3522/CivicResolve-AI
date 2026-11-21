import { defineConfig, devices } from '@playwright/test'

/** E2E happy path against the production build (`npm run build` first). */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    // Local sandboxes without a Playwright-managed browser can point at an existing Chromium.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bash ./e2e/serve.sh',
    url: 'http://localhost:3100/health',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
