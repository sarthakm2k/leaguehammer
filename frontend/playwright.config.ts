import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: '../.cache/browser-results',
  timeout: 180000,
  workers: 1,
  use: {
    baseURL: process.env.AUCTION_FRONTEND_URL || 'http://localhost:5174',
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    trace: { mode: 'retain-on-failure', screenshots: false },
  },
});
