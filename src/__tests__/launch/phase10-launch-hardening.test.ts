import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  PHASE10_KILL_SWITCH_CATALOG,
  PHASE10_KILL_SWITCH_NAMES,
  validateKillSwitchCatalog,
} from "@/lib/launch/kill-switch-catalog";
import { evaluateDegradedSafeMode } from "@/lib/launch/degraded-safe-mode";
import {
  PHASE10_CHAOS_DRILLS,
  PHASE10_CHAOS_SCENARIOS,
  validateChaosDrills,
} from "@/lib/launch/chaos-drills";
import {
  runSyntheticIdentityMergeDrill,
  runSyntheticIdentitySplitDrill,
  type IdentityDrillState,
} from "@/lib/launch/identity-drill";
import { simulateEmbeddingSwapDrill } from "@/lib/launch/embedding-drill";
import { simulateRestoreSemanticSmoke } from "@/lib/launch/restore-drill";
import { simulateEmergencyOpenPaywallDrill } from "@/lib/launch/emergency-fraud-drill";

const repoRoot = process.cwd();

function readRepoFile(file: string): string {
  return readFileSync(path.join(repoRoot, file), "utf8");
}

function repoPathFromReference(reference: string): string {
  return reference.split("#")[0];
}

describe("Phase 10 launch hardening", () => {
  it("has a complete kill-switch catalog with runbook evidence", () => {
    expect(validateKillSwitchCatalog()).toEqual([]);
    expect(PHASE10_KILL_SWITCH_CATALOG).toHaveLength(
      PHASE10_KILL_SWITCH_NAMES.length
    );

    for (const entry of PHASE10_KILL_SWITCH_CATALOG) {
      expect(entry.envVar).toMatch(/^KILL_SWITCH_/);
      expect(entry.rollback).toContain("Unset");
      expect(existsSync(path.join(repoRoot, entry.runbook))).toBe(true);
      expect(existsSync(path.join(repoRoot, entry.testReference))).toBe(true);
      expect(
        existsSync(path.join(repoRoot, repoPathFromReference(entry.runtimeReference)))
      ).toBe(true);
      expect(existsSync(path.join(repoRoot, entry.runtimeTestReference))).toBe(
        true
      );
    }

    const catalog = readRepoFile("docs/runbooks/kill-switch-catalog.md");
    const envExample = readRepoFile(".env.example");
    for (const entry of PHASE10_KILL_SWITCH_CATALOG) {
      expect(catalog).toContain(entry.name);
      expect(catalog).toContain(entry.envVar);
      expect(envExample).toContain(entry.envVar);
    }
  });

  it("defines degraded safe mode as list-only, semantic-disabled, no reveal, no publication", () => {
    expect(
      evaluateDegradedSafeMode({
        KILL_SWITCH_FORCE_LIST_ONLY: "true",
        KILL_SWITCH_DISABLE_SEMANTIC_SEARCH: "true",
        KILL_SWITCH_DISABLE_PHONE_REVEAL: "true",
        KILL_SWITCH_DISABLE_NEW_PUBLICATION: "true",
      })
    ).toEqual({
      enabled: true,
      missingEnvVars: [],
      activeBehaviors: [
        "list-only search",
        "semantic search disabled",
        "phone reveal disabled",
        "new publication disabled",
      ],
    });

    expect(
      evaluateDegradedSafeMode({
        KILL_SWITCH_FORCE_LIST_ONLY: "true",
      }).enabled
    ).toBe(false);
  });

  it("keeps Vercel/Sentry SLO stubs complete and PII-free", () => {
    const config = JSON.parse(
      readRepoFile("ops/slo/launch-slo-alerts.json")
    ) as {
      alertBackend: string;
      rules: Array<{
        id: string;
        sourceMetric: string;
        threshold: string;
        severity: string;
        sentryProject: string;
        vercelSignal: string;
      }>;
    };

    expect(config.alertBackend).toBe("vercel-sentry-stubs");
    expect(config.rules.map((rule) => rule.id).sort()).toEqual([
      "alert_delivery_safety",
      "embedding_lag",
      "identity_lag",
      "ledger_consistency",
      "paywall_latency",
      "projection_lag",
      "search_availability",
      "snapshot_hole_ratio",
      "webhook_processing",
      "write_success",
    ]);

    for (const rule of config.rules) {
      expect(["page", "ticket"]).toContain(rule.severity);
      expect(rule.sourceMetric).toBeTruthy();
      expect(rule.threshold).toBeTruthy();
      expect(rule.sentryProject).toBeTruthy();
      expect(rule.vercelSignal).toBeTruthy();
    }

    expect(JSON.stringify(config)).not.toMatch(
      /@|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b\d+\s+\w+\s+(Street|St|Ave|Road|Rd)\b/i
    );
  });

  it("runs public-payload PII scanner clean and leaking fixture cases", () => {
    const clean = execFileSync(
      "node",
      ["scripts/scan-public-payload-pii.js", "scripts/fixtures/public-payload-clean.json"],
      { cwd: repoRoot, encoding: "utf8" }
    );
    expect(clean).toContain('"ok":true');

    expect(() =>
      execFileSync(
        "node",
        [
          "scripts/scan-public-payload-pii.js",
          "scripts/fixtures/public-payload-leak.json",
        ],
        { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }
      )
    ).toThrow();
  });

  it("proves synthetic identity merge and split drills preserve downstream coherence", () => {
    const state: IdentityDrillState = {
      units: [
        { id: "unit-a", epoch: 4 },
        { id: "unit-b", epoch: 4 },
        { id: "unit-c", epoch: 4 },
      ],
      contactConsumptions: [
        {
          userId: "user-1",
          unitId: "unit-a",
          contactKind: "MESSAGE_START",
          unitIdentityEpoch: 4,
        },
        {
          userId: "user-2",
          unitId: "unit-b",
          contactKind: "REVEAL_PHONE",
          unitIdentityEpoch: 4,
        },
      ],
      entitlements: [
        { userId: "user-1", creditsRemaining: 2, activePass: false },
        { userId: "user-2", creditsRemaining: 1, activePass: true },
      ],
      savedUnitIds: ["unit-a", "unit-b"],
      reviewUnitIds: ["unit-a"],
      searchOrder: ["unit-a", "unit-b", "unit-c"],
    };

    const merge = runSyntheticIdentityMergeDrill(
      state,
      ["unit-a"],
      "unit-b"
    );
    expect(merge.kind).toBe("MERGE");
    expect(merge.anomalies).toEqual([]);
    expect(merge.entitlementCreditsAfter).toBe(merge.entitlementCreditsBefore);

    const split = runSyntheticIdentitySplitDrill(
      state,
      "unit-b",
      ["unit-b", "unit-c"]
    );
    expect(split.kind).toBe("SPLIT");
    expect(split.anomalies).toEqual([]);
    expect(split.entitlementCreditsAfter).toBe(split.entitlementCreditsBefore);
  });

  it("proves embedding swap, rollback, tombstone, restore, and emergency audit drills", () => {
    const swap = simulateEmbeddingSwapDrill({
      previousVersion: "embed-v1",
      targetVersion: "embed-v2",
      topK: 3,
      minTopKOverlap: 0.66,
      tombstonedInventoryIds: ["inv-tombstone"],
      rows: [
        {
          inventoryId: "inv-1",
          unitId: "unit-1",
          embeddingVersion: "embed-v1",
          publishStatus: "STALE_PUBLISHED",
          rank: 1,
        },
        {
          inventoryId: "inv-2",
          unitId: "unit-2",
          embeddingVersion: "embed-v1",
          publishStatus: "STALE_PUBLISHED",
          rank: 2,
        },
        {
          inventoryId: "inv-3",
          unitId: "unit-3",
          embeddingVersion: "embed-v1",
          publishStatus: "STALE_PUBLISHED",
          rank: 3,
        },
        {
          inventoryId: "inv-1",
          unitId: "unit-1",
          embeddingVersion: "embed-v2",
          publishStatus: "PUBLISHED",
          rank: 1,
        },
        {
          inventoryId: "inv-2",
          unitId: "unit-2",
          embeddingVersion: "embed-v2",
          publishStatus: "PUBLISHED",
          rank: 2,
        },
        {
          inventoryId: "inv-4",
          unitId: "unit-4",
          embeddingVersion: "embed-v2",
          publishStatus: "PUBLISHED",
          rank: 3,
        },
        {
          inventoryId: "inv-tombstone",
          unitId: "unit-5",
          embeddingVersion: "embed-v2",
          publishStatus: "TOMBSTONED",
          rank: 4,
        },
      ],
    });

    expect(swap.observableRankingGap).toBe(false);
    expect(swap.rollbackReadVersion).toBe("embed-v1");
    expect(swap.tombstoneViolations).toEqual([]);

    const restore = simulateRestoreSemanticSmoke({
      restoredAt: "2026-04-24T00:00:00.000Z",
      expectedEmbeddingVersion: "embed-v2",
      outboxPendingCount: 2,
      rows: [
        {
          inventoryId: "inv-1",
          unitId: "unit-1",
          embeddingVersion: "embed-v2",
          publishStatus: "PUBLISHED",
          matchesQuery: true,
        },
      ],
    });
    expect(restore.semanticSmokePassed).toBe(true);
    expect(restore.outboxReplayRequired).toBe(true);

    expect(
      simulateEmergencyOpenPaywallDrill({
        contactAttempts: 3,
        flagDisabledAfterExercise: true,
      })
    ).toEqual({
      emergencyGrantAuditCount: 3,
      fraudAuditJobsScheduled: 3,
      normalPaywallRestored: true,
    });
  });

  it("defines every launch chaos scenario as private and non-corrupting", () => {
    expect(validateChaosDrills()).toEqual([]);
    expect(PHASE10_CHAOS_DRILLS).toHaveLength(
      PHASE10_CHAOS_SCENARIOS.length
    );
    for (const drill of PHASE10_CHAOS_DRILLS) {
      expect(drill.dataCorruptionAllowed).toBe(false);
      expect(drill.privacyLeakAllowed).toBe(false);
      expect(drill.expectedDegradedBehavior).toBeTruthy();
    }
  });

  it("links launch runbooks, preflight, definition-of-done, and orchestrator spec", () => {
    const requiredFiles = [
      ".orchestrator/phases/phase-10-launch-hardening-drills/spec.md",
      "docs/launch/definition-of-done.md",
      "docs/launch/infra-preflight.md",
      "docs/runbooks/incident-response.md",
      "docs/runbooks/privacy-audit.md",
      "docs/runbooks/identity-merge.md",
      "docs/runbooks/identity-split.md",
      "docs/runbooks/backup-restore.md",
      "docs/runbooks/degraded-safe-mode.md",
      "docs/runbooks/cache-coherence-debug.md",
      "docs/runbooks/kill-switch-catalog.md",
      "docs/runbooks/chargeback-defrost.md",
      "docs/runbooks/emergency-open-paywall.md",
      "docs/runbooks/embedding-swap.md",
      "docs/runbooks/public-cache-coherence.md",
      "docs/runbooks/saved-search-alerts.md",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(path.join(repoRoot, file))).toBe(true);
    }

    const dod = readRepoFile("docs/launch/definition-of-done.md");
    expect(dod).not.toContain("- [ ]");
    expect(dod).toContain("Human launch signoff");
    expect(dod).toContain("scripts/scan-public-payload-pii.js");
  });
});
