import { defineConfig, devices } from "@playwright/test";
import dns from "node:dns";
import dotenv from "dotenv";
import path from "path";

dns.setDefaultResultOrder("ipv4first");

dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const port = Number(process.env.MULTISLOT_E2E_PORT || "3103");
const useExternalServer = process.env.PLAYWRIGHT_DISABLE_WEBSERVER === "true";
const baseURL =
  useExternalServer && process.env.E2E_BASE_URL
    ? process.env.E2E_BASE_URL
    : `http://127.0.0.1:${String(port)}`;

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
  E2E_TEST_HELPERS: forwardedEnv.E2E_TEST_HELPERS ?? "true",
  ENABLE_MULTI_SLOT_BOOKING:
    forwardedEnv.ENABLE_MULTI_SLOT_BOOKING ?? "true",
  ENABLE_WHOLE_UNIT_MODE: forwardedEnv.ENABLE_WHOLE_UNIT_MODE ?? "true",
  ENABLE_SOFT_HOLDS: forwardedEnv.ENABLE_SOFT_HOLDS ?? "on",
  ENABLE_BOOKING_AUDIT: forwardedEnv.ENABLE_BOOKING_AUDIT ?? "true",
  ENABLE_SEARCH_DOC: forwardedEnv.ENABLE_SEARCH_DOC ?? "true",
  ENABLE_SEMANTIC_SEARCH: forwardedEnv.ENABLE_SEMANTIC_SEARCH ?? "true",
  ENABLE_CLIENT_SIDE_SEARCH:
    forwardedEnv.ENABLE_CLIENT_SIDE_SEARCH ?? "false",
  NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH:
    forwardedEnv.NEXT_PUBLIC_ENABLE_CLIENT_SIDE_SEARCH ?? "false",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/multislot", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*auth\.setup\.ts/,
    },
    {
      name: "multislot-desktop-legacy",
      dependencies: ["setup"],
      testMatch: /multislot\/multi-slot-booking\.contract\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
      retries: 0,
    },
    {
      name: "multislot-desktop-searchdoc",
      dependencies: ["setup"],
      testMatch: /multislot\/multi-slot-booking\.contract\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
      retries: 0,
    },
    {
      name: "multislot-desktop-semantic",
      dependencies: ["setup"],
      testMatch: /multislot\/multi-slot-booking\.contract\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
      retries: 0,
    },
    {
      name: "multislot-mobile-smoke",
      dependencies: ["setup"],
      testMatch: /multislot\/multi-slot-booking\.contract\.spec\.ts/,
      grep:
        /search respects requested slot count|listing page and search agree|whole-unit listings hide the slot selector|pending bookings do not consume capacity/i,
      use: {
        ...devices["Pixel 7"],
      },
      retries: 0,
    },
    {
      name: "multislot-race",
      dependencies: ["setup"],
      testMatch: /multislot\/multi-slot-booking\.contract\.spec\.ts/,
      grep: /race:/i,
      workers: 1,
      repeatEach: process.env.CI ? 20 : 3,
      retries: 0,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: `pnpm run dev -- --port ${String(port)}`,
        url: `${baseURL}/api/health/ready`,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
        env: webServerEnv,
      },
  outputDir: "test-results/multislot",
});
