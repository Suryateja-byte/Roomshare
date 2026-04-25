export const PHASE10_KILL_SWITCH_NAMES = [
  "force_list_only",
  "force_clusters_only",
  "disable_semantic_search",
  "pause_geocode_publish",
  "pause_embed_publish",
  "rollback_ranker_profile",
  "rollback_embedding_version",
  "pause_backfills_and_repairs",
  "pause_identity_reconcile",
  "disable_payments",
  "freeze_new_grants",
  "disable_alerts",
  "emergency_open_paywall",
  "disable_phone_reveal",
  "disable_new_publication",
] as const;

export type Phase10KillSwitchName = (typeof PHASE10_KILL_SWITCH_NAMES)[number];

export interface Phase10KillSwitchCatalogEntry {
  name: Phase10KillSwitchName;
  envVar: string;
  owner: string;
  runbook: string;
  exercise: string;
  expectedDegradedBehavior: string;
  rollback: string;
  testReference: string;
}

export const PHASE10_KILL_SWITCH_CATALOG: Phase10KillSwitchCatalogEntry[] = [
  {
    name: "force_list_only",
    envVar: "KILL_SWITCH_FORCE_LIST_ONLY",
    owner: "search-oncall",
    runbook: "docs/runbooks/degraded-safe-mode.md",
    exercise: "Enable list-only mode and verify map clusters are not required.",
    expectedDegradedBehavior: "Search returns grouped list results without map dependency.",
    rollback: "Unset KILL_SWITCH_FORCE_LIST_ONLY after search/map health recovers.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "force_clusters_only",
    envVar: "KILL_SWITCH_FORCE_CLUSTERS_ONLY",
    owner: "search-oncall",
    runbook: "docs/runbooks/kill-switch-catalog.md",
    exercise: "Force cluster payloads and verify list hydration is not required.",
    expectedDegradedBehavior: "Map clients receive cluster-only payloads at all zoom levels.",
    rollback: "Unset KILL_SWITCH_FORCE_CLUSTERS_ONLY after list hydration recovers.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "disable_semantic_search",
    envVar: "KILL_SWITCH_DISABLE_SEMANTIC_SEARCH",
    owner: "search-oncall",
    runbook: "docs/runbooks/degraded-safe-mode.md",
    exercise: "Disable semantic candidates and verify filter-only search remains healthy.",
    expectedDegradedBehavior: "Search falls back to filter-only projection reads.",
    rollback: "Unset KILL_SWITCH_DISABLE_SEMANTIC_SEARCH after embedding/search quality recovers.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "pause_geocode_publish",
    envVar: "KILL_SWITCH_PAUSE_GEOCODE_PUBLISH",
    owner: "projection-oncall",
    runbook: "docs/runbooks/kill-switch-catalog.md",
    exercise: "Pause geocode publish and verify existing published rows remain readable.",
    expectedDegradedBehavior: "New geocode publish work requeues; existing public rows stay active.",
    rollback: "Unset KILL_SWITCH_PAUSE_GEOCODE_PUBLISH and drain the outbox.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "pause_embed_publish",
    envVar: "KILL_SWITCH_PAUSE_EMBED_PUBLISH",
    owner: "search-oncall",
    runbook: "docs/runbooks/embedding-swap.md",
    exercise: "Pause embedding publish and verify active semantic rows are preserved.",
    expectedDegradedBehavior: "Embedding work requeues without deleting active semantic rows.",
    rollback: "Unset KILL_SWITCH_PAUSE_EMBED_PUBLISH and resume embed drains.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "rollback_ranker_profile",
    envVar: "KILL_SWITCH_ROLLBACK_RANKER_PROFILE",
    owner: "search-oncall",
    runbook: "docs/runbooks/kill-switch-catalog.md",
    exercise: "Record previous ranker profile and verify query hash isolation in staging.",
    expectedDegradedBehavior: "Operators can pin reads to the prior ranker profile when wired.",
    rollback: "Unset KILL_SWITCH_ROLLBACK_RANKER_PROFILE after ranking stability is restored.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "rollback_embedding_version",
    envVar: "KILL_SWITCH_ROLLBACK_EMBEDDING_VERSION",
    owner: "search-oncall",
    runbook: "docs/runbooks/embedding-swap.md",
    exercise: "Set a previous embedding version and verify semantic reads target it.",
    expectedDegradedBehavior: "Semantic reads use the prior published embedding version.",
    rollback: "Unset KILL_SWITCH_ROLLBACK_EMBEDDING_VERSION after target version is healthy.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "pause_backfills_and_repairs",
    envVar: "KILL_SWITCH_PAUSE_BACKFILLS_AND_REPAIRS",
    owner: "projection-oncall",
    runbook: "docs/runbooks/kill-switch-catalog.md",
    exercise: "Pause repair jobs and verify foreground publish/search paths continue.",
    expectedDegradedBehavior: "Low-priority repair work stops while priority outbox work continues.",
    rollback: "Unset KILL_SWITCH_PAUSE_BACKFILLS_AND_REPAIRS and resume repair windows.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "pause_identity_reconcile",
    envVar: "KILL_SWITCH_PAUSE_IDENTITY_RECONCILE",
    owner: "identity-oncall",
    runbook: "docs/runbooks/identity-merge.md",
    exercise: "Pause identity reconciliation and verify manual publish/search remains coherent.",
    expectedDegradedBehavior: "Identity mutation repair queues pause without deleting public rows.",
    rollback: "Unset KILL_SWITCH_PAUSE_IDENTITY_RECONCILE and run identity reconciliation.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "disable_payments",
    envVar: "KILL_SWITCH_DISABLE_PAYMENTS",
    owner: "payments-oncall",
    runbook: "docs/runbooks/emergency-open-paywall.md",
    exercise: "Disable checkout and verify anonymous discovery remains free.",
    expectedDegradedBehavior: "New checkout is unavailable; existing entitlements remain ledger-driven.",
    rollback: "Unset KILL_SWITCH_DISABLE_PAYMENTS after Stripe health is confirmed.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "freeze_new_grants",
    envVar: "KILL_SWITCH_FREEZE_NEW_GRANTS",
    owner: "payments-oncall",
    runbook: "docs/runbooks/chargeback-defrost.md",
    exercise: "Freeze grants and verify payment events do not create active access.",
    expectedDegradedBehavior: "Grant projection pauses while payment capture remains idempotent.",
    rollback: "Unset KILL_SWITCH_FREEZE_NEW_GRANTS and replay verified payment events.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "disable_alerts",
    envVar: "KILL_SWITCH_DISABLE_ALERTS",
    owner: "alerts-oncall",
    runbook: "docs/runbooks/saved-search-alerts.md",
    exercise: "Disable alert matching/delivery and verify pending rows are retained.",
    expectedDegradedBehavior: "Alert work pauses without deleting saved searches or deliveries.",
    rollback: "Unset KILL_SWITCH_DISABLE_ALERTS and resume bounded alert drains.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "emergency_open_paywall",
    envVar: "KILL_SWITCH_EMERGENCY_OPEN_PAYWALL",
    owner: "payments-oncall",
    runbook: "docs/runbooks/emergency-open-paywall.md",
    exercise: "Open the paywall, create emergency grants, then run post-flag audit.",
    expectedDegradedBehavior: "Gated contact actions proceed with auditable emergency grants.",
    rollback: "Unset KILL_SWITCH_EMERGENCY_OPEN_PAYWALL and verify normal paywall order.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "disable_phone_reveal",
    envVar: "KILL_SWITCH_DISABLE_PHONE_REVEAL",
    owner: "privacy-oncall",
    runbook: "docs/runbooks/degraded-safe-mode.md",
    exercise: "Disable phone reveal and verify contact-host/message flows still work.",
    expectedDegradedBehavior: "Phone reveal fails closed without exposing raw phone data.",
    rollback: "Unset KILL_SWITCH_DISABLE_PHONE_REVEAL after reveal path is healthy.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
  {
    name: "disable_new_publication",
    envVar: "KILL_SWITCH_DISABLE_NEW_PUBLICATION",
    owner: "projection-oncall",
    runbook: "docs/runbooks/degraded-safe-mode.md",
    exercise: "Disable new publication and verify existing published rows stay readable.",
    expectedDegradedBehavior: "New public publish pauses; existing published projections remain served.",
    rollback: "Unset KILL_SWITCH_DISABLE_NEW_PUBLICATION and drain publish outbox lanes.",
    testReference: "src/__tests__/launch/phase10-launch-hardening.test.ts",
  },
];

export function validateKillSwitchCatalog(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const entry of PHASE10_KILL_SWITCH_CATALOG) {
    if (seen.has(entry.name)) {
      errors.push(`duplicate kill switch: ${entry.name}`);
    }
    seen.add(entry.name);

    for (const field of [
      "envVar",
      "owner",
      "runbook",
      "exercise",
      "expectedDegradedBehavior",
      "rollback",
      "testReference",
    ] as const) {
      if (!entry[field]) {
        errors.push(`${entry.name} missing ${field}`);
      }
    }
  }

  for (const name of PHASE10_KILL_SWITCH_NAMES) {
    if (!seen.has(name)) {
      errors.push(`missing kill switch: ${name}`);
    }
  }

  return errors;
}
