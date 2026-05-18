import type { APIRequestContext } from "@playwright/test";

export async function resetSearchE2EData(_request: APIRequestContext) {
  // Global setup already runs scripts/seed-e2e.js. Keep this hook so future
  // mutation-heavy search specs have one place to add deterministic cleanup.
}
