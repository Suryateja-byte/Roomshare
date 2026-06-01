#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const port = process.env.PORT || "3000";
const baseURL = process.env.E2E_BASE_URL || `http://localhost:${port}`;
const readinessURL = `${baseURL}/api/health/ready`;
const explicitE2ETestEmail = process.env.E2E_TEST_EMAIL;
const explicitE2ETestPassword = process.env.E2E_TEST_PASSWORD;

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });

const env = {
  ...process.env,
  CI: process.env.CI || "true",
  PORT: port,
  E2E_BASE_URL: baseURL,
  E2E_TEST_EMAIL: explicitE2ETestEmail || "e2e-test@roomshare.dev",
  E2E_TEST_PASSWORD: explicitE2ETestPassword || "TestPassword123!",
  E2E_TEST_HELPERS: process.env.E2E_TEST_HELPERS || "true",
  E2E_TEST_SECRET: process.env.E2E_TEST_SECRET || "roomshare-local-e2e-secret",
  E2E_DISABLE_RATE_LIMIT: process.env.E2E_DISABLE_RATE_LIMIT || "true",
  FEATURE_SEARCH_LISTING_DEDUP:
    process.env.FEATURE_SEARCH_LISTING_DEDUP || "true",
  FEATURE_LISTING_CREATE_COLLISION_WARN:
    process.env.FEATURE_LISTING_CREATE_COLLISION_WARN || "true",
  CURSOR_SECRET:
    process.env.CURSOR_SECRET ||
    "roomshare-local-e2e-cursor-hmac-key-20260530",
  TURNSTILE_ENABLED: "false",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  NEXT_PUBLIC_SUPABASE_URL: "https://fake.supabase.co",
  // E2E CI runs production-mode Next, but must not call live third-party APIs.
  PUBLIC_LOCATION_PROVIDER: "local",
  PHOTON_FALLBACK_ENABLED: "false",
  MAPBOX_ACCESS_TOKEN: "",
  GOOGLE_PLACES_API_KEY: "",
  GOOGLE_PLACES_PUBLIC_ENABLED: "false",
  GOOGLE_ADDRESS_VALIDATION_ENABLED: "false",
  SMARTY_ADDRESS_AUTOCOMPLETE_ENABLED: "false",
  SMARTY_AUTH_ID: "",
  SMARTY_AUTH_TOKEN: "",
  ENABLE_SEMANTIC_SEARCH: "false",
  KILL_SWITCH_DISABLE_SEMANTIC_SEARCH: "true",
  ENABLE_IMAGE_EMBEDDINGS: "false",
  GEMINI_API_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  KILL_SWITCH_DISABLE_PAYMENTS: "true",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  RESEND_API_KEY: "",
  GROQ_API_KEY: "",
  RADAR_SECRET_KEY: "",
  SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
};

function runSync(args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function stopServer(server) {
  if (!server || server.killed || server.exitCode !== null) {
    return;
  }

  try {
    if (process.platform === "win32") {
      server.kill("SIGTERM");
    } else {
      process.kill(-server.pid, "SIGTERM");
    }
  } catch (error) {
    if (error?.code !== "ESRCH") {
      console.error("Failed to stop Next production server:", error);
    }
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForReadiness(server) {
  const deadline = Date.now() + 180000;
  let lastError;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `Next production server exited before readiness with status ${server.exitCode}.`
      );
    }

    try {
      const response = await fetchWithTimeout(readinessURL, 2000);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Readiness returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(
    `Timed out waiting for Next production server readiness at ${readinessURL}: ${lastError?.message || "no response"}`
  );
}

async function main() {
  const buildStatus = runSync(["run", "build"]);
  if (buildStatus !== 0) {
    process.exit(buildStatus);
  }

  console.log(`\n$ ${command} exec next start --hostname 0.0.0.0`);
  const server = spawn(
    command,
    ["exec", "next", "start", "--hostname", "0.0.0.0"],
    {
      stdio: "inherit",
      env,
      detached: process.platform !== "win32",
    }
  );

  const stopAndExit = (exitCode) => {
    stopServer(server);
    process.exit(exitCode);
  };

  process.once("SIGINT", () => stopAndExit(130));
  process.once("SIGTERM", () => stopAndExit(143));

  try {
    await waitForReadiness(server);

    const playwrightArgs =
      process.argv.length > 2
        ? ["exec", "playwright", "test", ...process.argv.slice(2)]
        : [
            "exec",
            "playwright",
            "test",
            "--project=chromium",
            "--reporter=list,html",
            "--workers=1",
          ];

    const testStatus = runSync(playwrightArgs);
    process.exitCode = testStatus;
  } finally {
    stopServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
