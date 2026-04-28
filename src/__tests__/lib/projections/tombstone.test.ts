/**
 * @jest-environment node
 *
 * Tests for src/lib/projections/tombstone.ts
 * Uses PGlite Phase 02 fixture.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { handleTombstone } from "@/lib/projections/tombstone";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";
import type { TransactionClient } from "@/lib/db/with-actor";

let fixture: Phase02Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase02Fixture();
  __setProjectionEpochForTesting(BigInt(1));
}, 30_000);

afterAll(async () => {
  await fixture.close();
  __setProjectionEpochForTesting(null);
});

afterEach(() => {
  __setProjectionEpochForTesting(BigInt(1));
});

async function withTx<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return fixture.client.$transaction((tx) => fn(tx as unknown as TransactionClient));
}

async function seedUnitWithInventory(opts: {
  unitId?: string;
  invId?: string;
  publishStatus?: string;
  sourceVersion?: bigint;
}): Promise<{ unitId: string; invId: string }> {
  const unitId = opts.unitId ?? `unit-ts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const invId = opts.invId ?? `inv-ts-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const canonHash = `hash-${unitId}`;

  await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
  await fixture.insertInventorySearchProjection({
    id: invId,
    inventoryId: invId,
    unitId,
    publishStatus: opts.publishStatus ?? "PUBLISHED",
    sourceVersion: opts.sourceVersion ?? BigInt(1),
  });

  return { unitId, invId };
}

describe("handleTombstone()", () => {
  it("deletes the ISP row when inventoryId is provided", async () => {
    const { unitId, invId } = await seedUnitWithInventory({});

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: invId,
        reason: "TOMBSTONE",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(2),
      })
    );

    expect(result.deletedInventoryRows).toBe(1);
    expect(result.skippedStale).toBe(false);

    const rows = await fixture.getInventorySearchProjections();
    expect(rows.find((r) => r.inventoryId === invId)).toBeUndefined();
  });

  it("skips ISP deletion when inventoryId is null (unit-level tombstone)", async () => {
    const { unitId, invId } = await seedUnitWithInventory({});

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: null,
        reason: "TOMBSTONE",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(1),
      })
    );

    expect(result.deletedInventoryRows).toBe(0);
    // ISP row still exists (only unit-level action taken)
    const rows = await fixture.getInventorySearchProjections();
    expect(rows.find((r) => r.inventoryId === invId)).toBeDefined();
  });

  it("creates a cache_invalidations row", async () => {
    const { unitId, invId } = await seedUnitWithInventory({});

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: invId,
        reason: "SUPPRESSION",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(2),
      })
    );

    expect(result.cacheInvalidationId).toEqual(expect.any(String));

    const ci = await fixture.getCacheInvalidations();
    const found = ci.find((r) => r.id === result.cacheInvalidationId);
    expect(found).toBeDefined();
    expect(found!.reason).toBe("SUPPRESSION");
    expect(found!.unitId).toBe(unitId);
  });

  it("skips stale inventory tombstones without projection or cache fanout", async () => {
    const { unitId, invId } = await seedUnitWithInventory({
      sourceVersion: BigInt(10),
    });

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: invId,
        reason: "PAUSE",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(9),
      })
    );

    expect(result).toMatchObject({
      deletedInventoryRows: 0,
      unitRowDeleted: false,
      cacheInvalidationId: null,
      deletedSemanticRows: 0,
      skippedStale: true,
    });

    const rows = await fixture.getInventorySearchProjections();
    expect(rows.find((r) => r.inventoryId === invId)).toBeDefined();

    const ci = await fixture.getCacheInvalidations();
    expect(ci.filter((row) => row.unitId === unitId)).toHaveLength(0);

    const outbox = await fixture.getOutboxEvents();
    expect(
      outbox.filter(
        (event) => event.kind === "CACHE_INVALIDATE" && event.aggregateId === unitId
      )
    ).toHaveLength(0);
  });

  it("enqueues a CACHE_INVALIDATE outbox event at priority=10", async () => {
    const { unitId, invId } = await seedUnitWithInventory({});

    await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: invId,
        reason: "PAUSE",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(2),
      })
    );

    const outbox = await fixture.getOutboxEvents();
    const cacheEvent = outbox.find(
      (e) => e.kind === "CACHE_INVALIDATE" && e.aggregateId === unitId
    );
    expect(cacheEvent).toBeDefined();
    expect(cacheEvent!.priority).toBe(10);
  });

  it("reports unitRowDeleted=true when last inventory is tombstoned", async () => {
    const unitId = `unit-last-${Date.now()}`;
    const invId = `inv-last-${Date.now()}`;
    const canonHash = `hash-${unitId}`;

    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
    // Insert ISP as PUBLISHED (only inventory)
    await fixture.insertInventorySearchProjection({
      id: invId,
      inventoryId: invId,
      unitId,
      publishStatus: "PUBLISHED",
    });
    // Build UPP first
    await withTx((tx) => {
      const { rebuildUnitPublicProjection } = require("@/lib/projections/unit-projection");
      return rebuildUnitPublicProjection(tx, unitId, 1);
    });

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: invId,
        reason: "TOMBSTONE",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(2),
      })
    );

    expect(result.unitRowDeleted).toBe(true);

    const upps = await fixture.getUnitPublicProjections();
    expect(upps.find((r) => r.unitId === unitId)).toBeUndefined();
  });

  it("handles all tombstone reasons without error", async () => {
    const reasons = ["TOMBSTONE", "SUPPRESSION", "PAUSE", "ARCHIVE"] as const;

    for (const reason of reasons) {
      const { unitId, invId } = await seedUnitWithInventory({});

      await expect(
        withTx((tx) =>
          handleTombstone(tx, {
            unitId,
            inventoryId: invId,
            reason,
            unitIdentityEpoch: 1,
            sourceVersion: BigInt(1),
          })
        )
      ).resolves.not.toThrow();
    }
  });

  it("includes cacheInvalidationId in the CACHE_INVALIDATE outbox payload", async () => {
    const { unitId, invId } = await seedUnitWithInventory({});

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: invId,
        reason: "TOMBSTONE",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(2),
      })
    );

    const outbox = await fixture.getOutboxEvents();
    const cacheEvent = outbox.find(
      (e) => e.kind === "CACHE_INVALIDATE" && e.aggregateId === unitId
    );
    expect(cacheEvent!.payload.cacheInvalidationId).toBe(result.cacheInvalidationId);
  });
});
