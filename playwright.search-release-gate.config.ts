import { defineConfig, devices } from "@playwright/test";
import dns from "node:dns";
import dotenv from "dotenv";
import path from "path";

dns.setDefaultResultOrder("ipv4first");

dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const port = Number(process.env.SEARCH_RELEASE_GATE_PORT || "3101");
const useExternalServer = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === "true";
const baseURL =
  useExternalServer && process.env.E2E_BASE_URL
    ? process.env.E2E_BASE_URL
    : `http://127.0.0.1:${String(port)}`;
const clientMode =
  process.env.ENABLE_CLIENT_SIDE_SEARCH === "true" ? "client" : "ssr";
const useProductionServer =
  process.env.SEARCH_RELEASE_GATE_SERVER_MODE !== "dev";

const forwardedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] != null
  )
);

const webServerEnv = {
  ...forwardedEnv,
  PORT: String(port),
  E2E_BASE_URL: baseURL,
  NEXTAUTH_URL: baseURL,
  AUTH_URL: baseURL,
  ENABLE_SEARCH_TEST_SCENARIOS:
    forwardedEnv.ENABLE_SEARCH_TEST_SCENARIOS ?? "true",
  ENABLE_CLIENT_SIDE_SEARCH:
    forwardedEnv.ENABLE_CLIENT_SIDE_SEARCH ?? "false",
  NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH:
    forwardedEnv.NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH ??
    forwardedEnv.ENABLE_CLIENT_SIDE_SEARCH ??
    "false",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: `playwright-report/search-release-gate-${clientMode}`,
        open: "never",
      },
    ],
    [
      "json",
      {
        outputFile: `test-results/search-release-gate-${clientMode}/results.json`,
      },
    ],
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15000,
    navigationTimeout: 45000,
  },
  timeout: 60000,
  expect: {
    timeout: 15000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: /search-release-gate\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      testMatch: /search-release-gate\/.*\.spec\.ts/,
      use: {
        browserName: "webkit",
        viewport: { width: 1440, height: 900 },
      },
      dependencies: ["setup"],
    },
    {
      name: "Mobile Safari",
      testMatch: /search-release-gate\/.*\.spec\.ts/,
      use: {
        ...devices["iPhone 14"],
      },
      dependencies: ["setup"],
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
          command: useProductionServer
            ? `pnpm run start --port ${String(port)}`
            : `pnpm run dev -- --port ${String(port)}`,
          url: `${baseURL}/api/health/ready`,
          reuseExistingServer: false,
          timeout: 180000,
          stdout: "pipe",
          stderr: "pipe",
          env: webServerEnv,
        },
  outputDir: `test-results/search-release-gate-${clientMode}`,
});
