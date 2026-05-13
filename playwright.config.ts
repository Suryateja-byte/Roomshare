import { defineConfig, devices } from "@playwright/test";
import dns from "node:dns";
import dotenv from "dotenv";
import path from "path";

// Node.js >=17 defaults to IPv6-first DNS resolution.
// GitHub Actions runners resolve "localhost" to ::1 (IPv6) but Next.js
// binds to 127.0.0.1 (IPv4). Force IPv4-first to prevent ECONNREFUSED.
dns.setDefaultResultOrder("ipv4first");

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const runningDedupeSuite = process.argv.some(
  (arg) => arg.includes("tests/e2e/dedupe") || arg.includes("/dedupe/")
);
const runningSearchHarness = process.argv.some(
  (arg) => arg.includes("tests/e2e/search") || arg.includes("/search/")
);
const shouldEnableE2eTestHelpers =
  process.env.E2E_TEST_HELPERS === "true" || runningDedupeSuite;
const LOCAL_E2E_TEST_SECRET = "roomshare-local-e2e-test-secret";

if (shouldEnableE2eTestHelpers) {
  process.env.E2E_TEST_HELPERS = "true";
  process.env.E2E_TEST_SECRET =
    process.env.E2E_TEST_SECRET || LOCAL_E2E_TEST_SECRET;
}

if (runningDedupeSuite && process.env.VERCEL_ENV !== "production") {
  // Collision tests exercise the collision-specific moderation gate; the
  // generic create-listing limiter is persistent and can mask that behavior.
  process.env.E2E_DISABLE_RATE_LIMIT = "true";
}

const retiredBookingLifecycleSpecs = [
  /concurrent\/admin-host-race\.spec\.ts/,
  /concurrent\/held-slot-restoration\.spec\.ts/,
  /concurrent\/listing-deletion-cascade\.spec\.ts/,
];
const searchHarnessSpecs = "search/**/*.spec.ts";
const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] != null
  )
);

if (runningDedupeSuite) {
  webServerEnv.FEATURE_SEARCH_LISTING_DEDUP = "true";
  webServerEnv.FEATURE_LISTING_CREATE_COLLISION_WARN = "true";
}
webServerEnv.NEXT_PUBLIC_SUPABASE_URL =
  webServerEnv.NEXT_PUBLIC_SUPABASE_URL || "https://fake.supabase.co";

/**
 * Playwright configuration for RoomShare E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",

  /* Seed E2E test data before running tests */
  globalSetup: "./tests/e2e/global-setup.ts",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Limit workers to prevent overwhelming dev server */
  workers: process.env.CI || runningDedupeSuite || runningSearchHarness ? 1 : 3,

  /* Reporter to use */
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL from environment variable */
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",

    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",

    /* Capture screenshot on failure */
    screenshot: "only-on-failure",

    /* Record video on first retry */
    video: "on-first-retry",

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
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },

    /* /search E2E harness projects. These are scoped to tests/e2e/search so
       they do not duplicate the legacy suite when running all projects. */
    {
      name: "desktop-anonymous",
      testMatch: searchHarnessSpecs,
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    {
      name: "desktop-authenticated",
      testMatch: searchHarnessSpecs,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    {
      name: "mobile-anonymous",
      testMatch: searchHarnessSpecs,
      use: {
        ...devices["Pixel 7"],
      },
    },

    {
      name: "mobile-authenticated",
      testMatch: searchHarnessSpecs,
      use: {
        ...devices["Pixel 7"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    {
      name: "failure-mocked",
      testMatch: searchHarnessSpecs,
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    {
      name: "chromium",
      testIgnore: [
        /(\.anon|\.admin)\.spec\.ts/,
        ...retiredBookingLifecycleSpecs,
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    {
      name: "firefox",
      testIgnore: [
        /(\.anon|\.admin)\.spec\.ts/,
        ...retiredBookingLifecycleSpecs,
      ],
      use: {
        ...devices["Desktop Firefox"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    {
      name: "webkit",
      testIgnore: [
        /(\.anon|\.admin)\.spec\.ts/,
        ...retiredBookingLifecycleSpecs,
      ],
      use: {
        ...devices["Desktop Safari"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    /* Mobile viewports */
    {
      name: "Mobile Chrome",
      testIgnore: [
        /(\.anon|\.admin)\.spec\.ts/,
        ...retiredBookingLifecycleSpecs,
      ],
      use: {
        ...devices["Pixel 7"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    {
      name: "Mobile Safari",
      testIgnore: [
        /(\.anon|\.admin)\.spec\.ts/,
        ...retiredBookingLifecycleSpecs,
      ],
      use: {
        ...devices["iPhone 14"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },

    /* Admin tests — requires admin authentication. */
    {
      name: "chromium-admin",
      testMatch: /\.admin\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/admin.json",
      },
      dependencies: ["setup"],
    },

    /* Anonymous user tests (no auth required) */
    {
      name: "chromium-anon",
      testMatch: /.*\.anon\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },

    /* Cross-browser anon tests — critical 8 specs only.
       mobile-ux.anon and filter-modal.anon are excluded from firefox-anon:
       Firefox binary (ms-playwright/firefox-1511) is not installed in this environment.
       framer-motion AnimatePresence and Radix UI dialog hydration are also unreliable
       on Firefox CI runners. These specs are covered by chromium-anon.
       Re-enable once `npx playwright install firefox` is run in CI. */
    {
      name: "firefox-anon",
      testMatch:
        /search-p0-smoke\.anon|filter-price\.anon|filter-reset\.anon|search-sort-ordering\.anon|search-a11y\.anon|mobile-toggle\.anon/,
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "webkit-anon",
      testMatch:
        /search-p0-smoke\.anon|filter-modal\.anon|filter-price\.anon|filter-reset\.anon|search-sort-ordering\.anon|search-a11y\.anon|mobile-ux\.anon|mobile-toggle\.anon/,
      use: {
        ...devices["Desktop Safari"],
      },
    },
  ],

  /* Start dev server locally; skip in CI where server is started manually */
  webServer: process.env.E2E_BASE_URL
    ? undefined // CI: server already running (started by workflow before tests)
    : {
        command: "pnpm run dev",
        url: "http://localhost:3000/api/health/ready",
        reuseExistingServer: !runningDedupeSuite,
        timeout: 180000,
        stdout: "pipe",
        stderr: "pipe",
        env: webServerEnv,
      },

  /* Output folder for test artifacts */
  outputDir: "test-results/",
});
