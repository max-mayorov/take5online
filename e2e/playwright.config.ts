import { defineConfig, devices } from '@playwright/test';

const port = 8787;

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices['Pixel 7'],
    // Lets a machine with a preinstalled Chromium skip `playwright install`.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm --filter @take5/web build && pnpm --filter @take5/worker exec wrangler dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
