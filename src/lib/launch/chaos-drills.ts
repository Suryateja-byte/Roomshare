export const PHASE10_CHAOS_SCENARIOS = [
  "identical-query-storm",
  "geocoder-outage",
  "embedding-provider-outage",
  "embedding-version-swap-under-load",
  "projection-worker-outage",
  "redis-limiter-outage",
  "duplicate-create-storm",
  "conflicting-edits",
  "identity-mutation-storm",
  "webhook-retry-storm",
  "hot-user-partition-saturation",
] as const;

export type Phase10ChaosScenario = (typeof PHASE10_CHAOS_SCENARIOS)[number];

export interface ChaosScenarioSpec {
  name: Phase10ChaosScenario;
  trigger: string;
  expectedDegradedBehavior: string;
  dataCorruptionAllowed: false;
  privacyLeakAllowed: false;
  evidence: string;
}

export const PHASE10_CHAOS_DRILLS: ChaosScenarioSpec[] = [
  {
    name: "identical-query-storm",
    trigger: "Replay the same normalized search query at 10x launch baseline.",
    expectedDegradedBehavior: "Snapshot reuse and rate limits protect search availability.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "geocoder-outage",
    trigger: "Make geocoder calls throw or time out.",
    expectedDegradedBehavior: "Geocode publish work requeues; existing projections remain readable.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "embedding-provider-outage",
    trigger: "Make the embedding provider fail for EMBED_NEEDED work.",
    expectedDegradedBehavior: "Inventory remains pending embedding or falls back to filter search.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "embedding-version-swap-under-load",
    trigger: "Swap embedding versions while reads continue.",
    expectedDegradedBehavior: "Read version remains pinned; tombstones affect active and shadow rows.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "projection-worker-outage",
    trigger: "Stop projection/outbox workers during publish activity.",
    expectedDegradedBehavior: "Outbox rows remain retryable and public reads use last published state.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "redis-limiter-outage",
    trigger: "Make Upstash/limiter calls unavailable.",
    expectedDegradedBehavior: "DB-backed or fail-closed action limits protect sensitive routes.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "duplicate-create-storm",
    trigger: "Submit duplicate unit/listing creation requests concurrently.",
    expectedDegradedBehavior: "Idempotency and identity locks collapse duplicates.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "conflicting-edits",
    trigger: "Submit concurrent host/moderation edits.",
    expectedDegradedBehavior: "Moderation locks win and stale writes return structured failures.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "identity-mutation-storm",
    trigger: "Run synthetic merge/split work against overlapping units.",
    expectedDegradedBehavior: "Identity mutations serialize and downstream projections stay coherent.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "webhook-retry-storm",
    trigger: "Replay Stripe webhook events repeatedly and out of order.",
    expectedDegradedBehavior: "Captured events are idempotent and grant math is exactly once.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "hot-user-partition-saturation",
    trigger: "Route many entitlement/contact actions for one user.",
    expectedDegradedBehavior: "Hot-user serialization preserves ledger consistency.",
    dataCorruptionAllowed: false,
    privacyLeakAllowed: false,
    evidence: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
];

export function validateChaosDrills(): string[] {
  const errors: string[] = [];
  const seen = new Set(PHASE10_CHAOS_DRILLS.map((drill) => drill.name));

  for (const scenario of PHASE10_CHAOS_SCENARIOS) {
    if (!seen.has(scenario)) {
      errors.push(`missing chaos drill: ${scenario}`);
    }
  }

  for (const drill of PHASE10_CHAOS_DRILLS) {
    if (drill.dataCorruptionAllowed !== false) {
      errors.push(`${drill.name} allows data corruption`);
    }
    if (drill.privacyLeakAllowed !== false) {
      errors.push(`${drill.name} allows privacy leaks`);
    }
    if (!drill.expectedDegradedBehavior || !drill.evidence) {
      errors.push(`${drill.name} missing degraded behavior or evidence`);
    }
  }

  return errors;
}
