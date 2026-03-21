import { execFileSync } from "child_process";
import path from "path";

/**
 * Playwright global setup — seeds E2E test data before any tests run.
 */
export default async function globalSetup() {
  if (process.env.SKIP_E2E_SEED) {
    console.log("[global-setup] Skipping E2E seed (SKIP_E2E_SEED set)");
    return;
  }
  console.log("[global-setup] Running E2E seed...");
  try {
    execFileSync("node", ["scripts/seed-e2e.js"], {
      cwd: path.resolve(__dirname, "../.."),
      stdio: "inherit",
      timeout: 30000,
    });
    console.log("[global-setup] E2E seed completed");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[global-setup] Seed failed (fatal):", message);
    throw new Error(`E2E seed failed: ${message}`);
  }
}
