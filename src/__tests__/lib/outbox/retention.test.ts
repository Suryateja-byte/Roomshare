/**
 * @jest-environment node
 *
 * Tests for src/lib/outbox/retention.ts (H2: bound outbox_events growth).
 * Uses the PGlite Phase 02 fixture so the real SQL (CTE deletes, window
 * function compaction) is exercised against the actual schema + indexes.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import {
  cleanupConsumedCacheInvalidationsOnce,
  cleanupTerminalOutboxEventsOnce,
  compactSupersededOutboxEventsOnce,
  COMPACTABLE_OUTBOX_KINDS,
} from "@/lib/outbox/retention";
import { randomUUID } from "crypto";

let fixture: Phase02Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase02Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

beforeEach(async () => {
  await fixture.query(`DELETE FROM outbox_events`);
  await fixture.query(`DELETE FROM cache_invalidations`);
});

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function outboxIds(): Promise<Set<string>> {
  const rows = await fixture.query(`SELECT id FROM outbox_events`);
  return new Set(rows.map((r) => String((r as { id: string }).id)));
}

async function seedCacheInvalidation(opts: {
  consumed: boolean;
  fanoutStatus: string;
  enqueuedDaysAgo: number;
}): Promise<string> {
  const id = randomUUID();
  await fixture.query(`
    INSERT INTO cache_invalidations (
      id, unit_id, projection_epoch, unit_identity_epoch, reason,
      enqueued_at, consumed_at, consumed_by, fanout_status
    ) VALUES (
      '${id}', '${randomUUID()}', 1, 1, 'TEST',
      NOW() - INTERVAL '${opts.enqueuedDaysAgo} days',
      ${opts.consumed ? `NOW() - INTERVAL '${opts.enqueuedDaysAgo} days'` : "NULL"},
      ${opts.consumed ? `'outbox-drain'` : "NULL"},
      '${opts.fanoutStatus}'
    )
  `);
  return id;
}

describe("cleanupTerminalOutboxEventsOnce()", () => {
  it("deletes COMPLETED rows past 7d and DLQ rows past 30d, keeps younger terminal rows", async () => {
    const oldCompleted = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      status: "COMPLETED",
      updatedAt: daysAgo(8),
    });
    const freshCompleted = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      status: "COMPLETED",
      updatedAt: daysAgo(1),
    });
    const oldDlq = await fixture.seedOutboxEvent({
      kind: "GEOCODE_NEEDED",
      status: "DLQ",
      dlqReason: "MAX_ATTEMPTS_EXHAUSTED",
      updatedAt: daysAgo(31),
    });
    const freshDlq = await fixture.seedOutboxEvent({
      kind: "GEOCODE_NEEDED",
      status: "DLQ",
      dlqReason: "MAX_ATTEMPTS_EXHAUSTED",
      updatedAt: daysAgo(7),
    });

    const result = await cleanupTerminalOutboxEventsOnce({
      client: fixture.client,
    });

    expect(result.deletedCompleted).toBe(1);
    expect(result.deletedDlq).toBe(1);
    expect(result.truncated).toBe(false);

    const survivors = await outboxIds();
    expect(survivors.has(oldCompleted)).toBe(false);
    expect(survivors.has(oldDlq)).toBe(false);
    expect(survivors.has(freshCompleted)).toBe(true);
    expect(survivors.has(freshDlq)).toBe(true);
  });

  it("never touches PENDING or IN_FLIGHT rows regardless of age", async () => {
    const pending = await fixture.seedOutboxEvent({
      kind: "PAYMENT_WEBHOOK",
      status: "PENDING",
      updatedAt: daysAgo(90),
      createdAt: daysAgo(90),
    });
    const inFlight = await fixture.seedOutboxEvent({
      kind: "ALERT_DELIVER",
      status: "IN_FLIGHT",
      updatedAt: daysAgo(90),
      createdAt: daysAgo(90),
    });

    const result = await cleanupTerminalOutboxEventsOnce({
      client: fixture.client,
    });

    expect(result.deletedCompleted).toBe(0);
    expect(result.deletedDlq).toBe(0);
    const survivors = await outboxIds();
    expect(survivors.has(pending)).toBe(true);
    expect(survivors.has(inFlight)).toBe(true);
  });

  it("deletes terminal rows of protected kinds (protection applies to non-terminal lanes only)", async () => {
    const terminalPayment = await fixture.seedOutboxEvent({
      kind: "PAYMENT_WEBHOOK",
      status: "COMPLETED",
      updatedAt: daysAgo(8),
    });

    await cleanupTerminalOutboxEventsOnce({ client: fixture.client });

    const survivors = await outboxIds();
    expect(survivors.has(terminalPayment)).toBe(false);
  });

  it("paginates in batches until the backlog is drained", async () => {
    for (let i = 0; i < 3; i += 1) {
      await fixture.seedOutboxEvent({
        kind: "INVENTORY_UPSERTED",
        status: "COMPLETED",
        updatedAt: daysAgo(10 + i),
      });
    }

    const result = await cleanupTerminalOutboxEventsOnce({
      client: fixture.client,
      batchSize: 1,
    });

    expect(result.deletedCompleted).toBe(3);
    expect(result.batches).toBe(3);
    expect((await outboxIds()).size).toBe(0);
  });

  it("stops at the time budget and reports truncated", async () => {
    await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      status: "COMPLETED",
      updatedAt: daysAgo(8),
    });

    const result = await cleanupTerminalOutboxEventsOnce({
      client: fixture.client,
      maxRunMs: 0,
    });

    expect(result.truncated).toBe(true);
    expect(result.deletedCompleted).toBe(0);
    expect((await outboxIds()).size).toBe(1);
  });

  it("honors custom retention windows", async () => {
    const youngCompleted = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      status: "COMPLETED",
      updatedAt: daysAgo(2),
    });

    const result = await cleanupTerminalOutboxEventsOnce({
      client: fixture.client,
      completedRetentionMs: 24 * 60 * 60 * 1000, // 1 day
    });

    expect(result.deletedCompleted).toBe(1);
    expect((await outboxIds()).has(youngCompleted)).toBe(false);
  });

  it("propagates client errors so the cron task records a failure", async () => {
    const failing = {
      $queryRaw: jest.fn().mockRejectedValue(new Error("boom")),
    };

    await expect(
      cleanupTerminalOutboxEventsOnce({ client: failing })
    ).rejects.toThrow("boom");
  });
});

describe("compactSupersededOutboxEventsOnce()", () => {
  it("keeps only the newest PENDING row per (aggregate_type, aggregate_id, kind)", async () => {
    const aggregateId = randomUUID();
    const v1 = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateType: "LISTING_INVENTORY",
      aggregateId,
      sourceVersion: BigInt(1),
      status: "PENDING",
    });
    const v2 = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateType: "LISTING_INVENTORY",
      aggregateId,
      sourceVersion: BigInt(2),
      status: "PENDING",
    });
    const v3 = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateType: "LISTING_INVENTORY",
      aggregateId,
      sourceVersion: BigInt(3),
      status: "PENDING",
    });

    const result = await compactSupersededOutboxEventsOnce({
      client: fixture.client,
    });

    expect(result.deletedSuperseded).toBe(2);
    expect(result.byKind).toEqual({ INVENTORY_UPSERTED: 2 });

    const survivors = await outboxIds();
    expect(survivors.has(v1)).toBe(false);
    expect(survivors.has(v2)).toBe(false);
    expect(survivors.has(v3)).toBe(true);
  });

  it("does not cross-compact different aggregates and keeps single rows", async () => {
    const a = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateType: "LISTING_INVENTORY",
      aggregateId: randomUUID(),
      status: "PENDING",
    });
    const b = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateType: "LISTING_INVENTORY",
      aggregateId: randomUUID(),
      status: "PENDING",
    });

    const result = await compactSupersededOutboxEventsOnce({
      client: fixture.client,
    });

    expect(result.deletedSuperseded).toBe(0);
    const survivors = await outboxIds();
    expect(survivors.has(a)).toBe(true);
    expect(survivors.has(b)).toBe(true);
  });

  it("ignores IN_FLIGHT siblings — they neither count as newest nor get deleted", async () => {
    const aggregateId = randomUUID();
    const pendingV1 = await fixture.seedOutboxEvent({
      kind: "UNIT_UPSERTED",
      aggregateType: "PHYSICAL_UNIT",
      aggregateId,
      sourceVersion: BigInt(1),
      status: "PENDING",
    });
    const pendingV2 = await fixture.seedOutboxEvent({
      kind: "UNIT_UPSERTED",
      aggregateType: "PHYSICAL_UNIT",
      aggregateId,
      sourceVersion: BigInt(2),
      status: "PENDING",
    });
    const inFlightV3 = await fixture.seedOutboxEvent({
      kind: "UNIT_UPSERTED",
      aggregateType: "PHYSICAL_UNIT",
      aggregateId,
      sourceVersion: BigInt(3),
      status: "IN_FLIGHT",
    });

    const result = await compactSupersededOutboxEventsOnce({
      client: fixture.client,
    });

    expect(result.deletedSuperseded).toBe(1);
    expect(result.byKind).toEqual({ UNIT_UPSERTED: 1 });

    const survivors = await outboxIds();
    expect(survivors.has(pendingV1)).toBe(false);
    expect(survivors.has(pendingV2)).toBe(true);
    expect(survivors.has(inFlightV3)).toBe(true);
  });

  it("never compacts non-allowlisted kinds", async () => {
    const aggregateId = randomUUID();
    const ids: string[] = [];
    for (const kind of ["CACHE_INVALIDATE", "PAYMENT_WEBHOOK", "ALERT_DELIVER"]) {
      for (const version of [1, 2]) {
        ids.push(
          await fixture.seedOutboxEvent({
            kind,
            aggregateType: "TEST_AGGREGATE",
            aggregateId,
            sourceVersion: BigInt(version),
            status: "PENDING",
          })
        );
      }
    }

    const result = await compactSupersededOutboxEventsOnce({
      client: fixture.client,
    });

    expect(result.deletedSuperseded).toBe(0);
    const survivors = await outboxIds();
    for (const id of ids) {
      expect(survivors.has(id)).toBe(true);
    }
  });

  it("breaks source_version ties by created_at (newest wins)", async () => {
    const aggregateId = randomUUID();
    const older = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateType: "LISTING_INVENTORY",
      aggregateId,
      sourceVersion: BigInt(5),
      status: "PENDING",
      createdAt: daysAgo(2),
    });
    const newer = await fixture.seedOutboxEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateType: "LISTING_INVENTORY",
      aggregateId,
      sourceVersion: BigInt(5),
      status: "PENDING",
      createdAt: daysAgo(1),
    });

    await compactSupersededOutboxEventsOnce({ client: fixture.client });

    const survivors = await outboxIds();
    expect(survivors.has(older)).toBe(false);
    expect(survivors.has(newer)).toBe(true);
  });

  it("is a no-op for an empty kinds list", async () => {
    const result = await compactSupersededOutboxEventsOnce({
      client: fixture.client,
      kinds: [],
    });

    expect(result.deletedSuperseded).toBe(0);
    expect(result.batches).toBe(0);
  });

  it("stops at the time budget and reports truncated", async () => {
    const aggregateId = randomUUID();
    for (const version of [1, 2]) {
      await fixture.seedOutboxEvent({
        kind: "INVENTORY_UPSERTED",
        aggregateType: "LISTING_INVENTORY",
        aggregateId,
        sourceVersion: BigInt(version),
        status: "PENDING",
      });
    }

    const result = await compactSupersededOutboxEventsOnce({
      client: fixture.client,
      maxRunMs: 0,
    });

    expect(result.truncated).toBe(true);
    expect(result.deletedSuperseded).toBe(0);
    expect((await outboxIds()).size).toBe(2);
  });

  it("exposes the default allowlist", () => {
    expect(COMPACTABLE_OUTBOX_KINDS).toEqual([
      "INVENTORY_UPSERTED",
      "UNIT_UPSERTED",
    ]);
  });
});

describe("cleanupConsumedCacheInvalidationsOnce()", () => {
  it("deletes consumed fanout-terminal rows past the TTL, keeps everything else", async () => {
    const deletable = await seedCacheInvalidation({
      consumed: true,
      fanoutStatus: "DELIVERED",
      enqueuedDaysAgo: 8,
    });
    const skipped = await seedCacheInvalidation({
      consumed: true,
      fanoutStatus: "SKIPPED",
      enqueuedDaysAgo: 8,
    });
    const failed = await seedCacheInvalidation({
      consumed: true,
      fanoutStatus: "FAILED",
      enqueuedDaysAgo: 8,
    });
    const fanoutPending = await seedCacheInvalidation({
      consumed: true,
      fanoutStatus: "PENDING",
      enqueuedDaysAgo: 8,
    });
    const unconsumed = await seedCacheInvalidation({
      consumed: false,
      fanoutStatus: "PENDING",
      enqueuedDaysAgo: 8,
    });
    const fresh = await seedCacheInvalidation({
      consumed: true,
      fanoutStatus: "DELIVERED",
      enqueuedDaysAgo: 1,
    });

    const result = await cleanupConsumedCacheInvalidationsOnce({
      client: fixture.client,
    });

    expect(result.deleted).toBe(3);
    expect(result.truncated).toBe(false);

    const rows = await fixture.query(`SELECT id FROM cache_invalidations`);
    const survivors = new Set(rows.map((r) => String((r as { id: string }).id)));
    expect(survivors.has(deletable)).toBe(false);
    expect(survivors.has(skipped)).toBe(false);
    expect(survivors.has(failed)).toBe(false);
    expect(survivors.has(fanoutPending)).toBe(true);
    expect(survivors.has(unconsumed)).toBe(true);
    expect(survivors.has(fresh)).toBe(true);
  });

  it("stops at the time budget and reports truncated", async () => {
    await seedCacheInvalidation({
      consumed: true,
      fanoutStatus: "DELIVERED",
      enqueuedDaysAgo: 8,
    });

    const result = await cleanupConsumedCacheInvalidationsOnce({
      client: fixture.client,
      maxRunMs: 0,
    });

    expect(result.truncated).toBe(true);
    expect(result.deleted).toBe(0);
  });
});
