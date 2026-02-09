import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * Playwright configuration for RoomShare E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  /* Seed E2E test data before running tests */
  globalSetup: './tests/e2e/global-setup.ts',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Limit workers to prevent overwhelming dev server */
  workers: process.env.CI ? 1 : 3,

  /* Reporter to use */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL from environment variable */
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on first retry */
    video: 'on-first-retry',

    /* Default timeout for actions */
    actionTimeout: 15000,

    /* Default navigation timeout — generous for dev server under load */
    navigationTimeout: 45000,
  },

  /* Global timeout for each test (3x for test.slow()) */
  timeout: 60000,

  /* Expect timeout — generous for server-rendered pages under load */
  expect: {
    timeout: 15000,
  },

  /* Configure projects for major browsers */
  projects: [
    /* Setup project for authentication */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    /* Mobile viewports */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    /* Anonymous user tests (no auth required) */
    {
      name: 'chromium-anon',
      testMatch: /.*\.anon\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    // Clean Next.js lockfile before starting to avoid WSL/NTFS permission issues
    command: 'pnpm run clean:next-locks && pnpm run dev',
    // Wait for ready endpoint (checks database connectivity)
    url: 'http://localhost:3000/api/health/ready',
    // Reuse existing server locally for faster iteration, fresh in CI
    reuseExistingServer: !process.env.CI,
    // Increase timeout for cold starts with database initialization
    timeout: 180000,
    stdout: 'pipe',
    stderr: 'pipe',
    // Forward dotenv-loaded vars (AUTH_SECRET, etc.) to the child process
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] != null),
    ),
  },

  /* Output folder for test artifacts */
  outputDir: 'test-results/',
});
