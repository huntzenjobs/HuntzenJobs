import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PRODUCTION testing
 * Tests deployed backend (Railway) + frontend (Vercel)
 *
 * Usage: npx playwright test --config=playwright.production.config.ts
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: false, // Sequential for production tests

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry failed tests */
  retries: 2, // Retry on flaky network issues

  /* Workers */
  workers: 1, // Sequential on production

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report-production' }],
    ['list'],
    ['json', { outputFile: 'test-results-production.json' }],
  ],

  /* Shared settings */
  use: {
    /* PRODUCTION URLs */
    baseURL: 'https://huntzenjobs.com',

    /* Trace */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',

    /* Extra HTTP headers */
    extraHTTPHeaders: {
      'User-Agent': 'Playwright-E2E-Tests/1.0',
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium-production',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'mobile-production',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],

  /* NO webServer - we test deployed production */
  // webServer: undefined, // Production is already running

  /* Global timeout for each test */
  timeout: 90 * 1000, // 90 sec (Stripe + webhook latency)

  /* Expect timeout */
  expect: {
    timeout: 15 * 1000, // 15 sec for assertions
  },

  /* Output directory for test artifacts */
  outputDir: 'test-results-production/',
});
