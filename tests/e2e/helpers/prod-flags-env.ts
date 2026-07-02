/**
 * Prod-effective feature-flag environment for E2E parity testing.
 *
 * Context (docs/multislot-review-2026-07-02.md · P2-13, §4 flag matrix):
 * every CFM `phaseCutoverDefault(env)` flag resolves to ON in dev/preview but
 * OFF in prod (the default is `NODE_ENV !== "production"` unless the env var is
 * explicitly set). Dev/preview E2E therefore validate a DIFFERENT system than
 * prod serves — a different read engine (SearchDoc vs the phase-04 projection),
 * different result grouping (dedup), and paywall-on vs paywall-off card shapes.
 *
 * This map pins every one of those flags to its prod-effective value so a
 * dedicated Playwright run exercises the engine + card shape prod actually ships.
 * Explicit "false" for each `phaseCutoverDefault` flag reproduces the prod
 * default without relying on NODE_ENV; `ENABLE_SEARCH_DOC=true` matches the
 * documented prod read engine (docs/DEPLOYMENT.md; §4 "confirm set in prod").
 *
 * Single source of truth: consumed by playwright.config.ts (injected into the
 * launched web server's env) and by the prod-flags smoke spec's runtime guard.
 * Keep every key mapped to the getters in `src/lib/env.ts`.
 */
export const PROD_EFFECTIVE_FLAG_ENV: Readonly<Record<string, string>> = {
  // Read path + card shape — the largest dev/prod gap (P2-13).
  FEATURE_PHASE04_PROJECTION_READS: "false",
  FEATURE_SEARCH_LISTING_DEDUP: "false",
  // Projection write path (dark writes) — prod default OFF, for a faithful snapshot.
  FEATURE_PHASE02_PROJECTION_WRITES: "false",
  FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES: "false",
  // Contact / paywall / entitlement surface — prod default OFF.
  ENABLE_CONTACT_FIRST_LISTINGS: "false",
  ENABLE_CONTACT_PAYWALL: "false",
  ENABLE_CONTACT_PAYWALL_ENFORCEMENT: "false",
  ENABLE_SEARCH_ALERT_PAYWALL: "false",
  ENABLE_ENTITLEMENT_STATE: "false",
  ENABLE_CONTACT_RESTORATION_AUTOMATION: "false",
  ENABLE_PRIVATE_FEEDBACK: "false",
  // Public contract / cache / listing-create surface — prod default OFF.
  FEATURE_PUBLIC_AUTOCOMPLETE_CONTRACT: "false",
  FEATURE_PUBLIC_CACHE_COHERENCE: "false",
  FEATURE_LISTING_CREATE_COLLISION_WARN: "false",
  FEATURE_MODERATION_WRITE_LOCKS: "false",
  // Documented prod read engine (SearchDoc, not the legacy LIKE path).
  ENABLE_SEARCH_DOC: "true",
} as const;

/**
 * Runtime signal that the current Playwright process is the prod-flags run.
 * Set by playwright.config.ts (from `--project=prod-flags-smoke` or the env
 * var) so the smoke spec can skip itself under any other project/invocation.
 */
export const PROD_FLAGS_RUN_ENV = "E2E_PROD_FLAGS";

export function isProdFlagsRun(): boolean {
  return process.env[PROD_FLAGS_RUN_ENV] === "true";
}
