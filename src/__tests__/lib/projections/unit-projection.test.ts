/**
 * @jest-environment node
 *
 * Tests for src/lib/projections/unit-projection.ts
 * Uses PGlite Phase 02 fixture.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { rebuildUnitPublicProjection } from "@/lib/projections/unit-projection";
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

/** Seed an ISP row with given publishStatus */
async function seedIsp(opts: {
  unitId: string;
  inventoryId?: string;
  publishStatus?: string;
  price?: number;
  sourceVersion?: bigint;
}): Promise<string> {
  const invId = opts.inventoryId ?? `inv-upp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fixture.insertInventorySearchProjection({
    id: invId,
    inventoryId: invId,
    unitId: opts.unitId,
    unitIdentityEpoch: 1,
    publishStatus: opts.publishStatus ?? "PUBLISHED",
    price: opts.price ?? 1000,
    sourceVersion: opts.sourceVersion ?? BigInt(1),
  });
  return invId;
}

describe("rebuildUnitPublicProjection()", () => {
  it("creates a UPP row when there are PUBLISHED inventories", async () => {
    const unitId = `unit-upp-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    await seedIsp({ unitId, publishStatus: "PUBLISHED", price: 1500 });

    const result = await withTx((tx) =>
      rebuildUnitPublicProjection(tx, unitId, 1)
    );

    expect(result.upserted).toBe(true);
    expect(result.deleted).toBe(false);
    expect(result.matchingInventoryCount).toBe(1);
    expect(result.sourceVersion).toBe(BigInt(1));

    const rows = await fixture.getUnitPublicProjections();
    const row = rows.find((r) => r.unitId === unitId);
    expect(row).toBeDefined();
    expect(row!.matchingInventoryCount).toBe(1);
  });

  it("counts multiple PUBLISHED inventories for the same unit", async () => {
    const unitId = `unit-multi-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    await seedIsp({ unitId, publishStatus: "PUBLISHED", price: 1000, sourceVersion: BigInt(1) });
    await seedIsp({ unitId, publishStatus: "PUBLISHED", price: 2000, sourceVersion: BigInt(2) });

    const result = await withTx((tx) =>
      rebuildUnitPublicProjection(tx, unitId, 1)
    );

    expect(result.matchingInventoryCount).toBe(2);
    // from_price should be the minimum
    const rows = await fixture.getUnitPublicProjections();
    const row = rows.find((r) => r.unitId === unitId);
    expect(row).toBeDefined();
  });

  it("includes STALE_PUBLISHED inventories in the count", async () => {
    const unitId = `unit-stale-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    await seedIsp({ unitId, publishStatus: "STALE_PUBLISHED" });

    const result = await withTx((tx) =>
      rebuildUnitPublicProjection(tx, unitId, 1)
    );

    expect(result.matchingInventoryCount).toBe(1);
    expect(result.upserted).toBe(true);
  });

  it("does NOT count PENDING_PROJECTION inventories", async () => {
    const unitId = `unit-pending-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    await seedIsp({ unitId, publishStatus: "PENDING_PROJECTION" });

    const result = await withTx((tx) =>
      rebuildUnitPublicProjection(tx, unitId, 1)
    );

    // No visible inventory — should not upsert
    expect(result.matchingInventoryCount).toBe(0);
    expect(result.upserted).toBe(false);
  });

  it("deletes UPP row when matchingInventoryCount drops to 0", async () => {
    const unitId = `unit-del-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });

    // First: seed and build projection with PUBLISHED inventory
    await seedIsp({ unitId, publishStatus: "PUBLISHED" });
    await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));

    // Verify it was created
    let rows = await fixture.getUnitPublicProjections();
    expect(rows.find((r) => r.unitId === unitId)).toBeDefined();

    // Remove the ISP row (simulate tombstone)
    await fixture.query(
      `DELETE FROM inventory_search_projection WHERE unit_id = '${unitId}'`
    );

    // Rebuild — should delete UPP row
    const result = await withTx((tx) =>
      rebuildUnitPublicProjection(tx, unitId, 1)
    );

    expect(result.deleted).toBe(true);
    expect(result.matchingInventoryCount).toBe(0);

    rows = await fixture.getUnitPublicProjections();
    expect(rows.find((r) => r.unitId === unitId)).toBeUndefined();
  });

  it("returns deleted=false when no UPP row exists to delete", async () => {
    const unitId = `unit-nodelete-${Date.now()}`;

    const result = await withTx((tx) =>
      rebuildUnitPublicProjection(tx, unitId, 1)
    );

    expect(result.deleted).toBe(false);
    expect(result.matchingInventoryCount).toBe(0);
  });

  it("stores MAX(source_version) of the current aggregate", async () => {
    const unitId = `unit-greatest-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });

    // Seed two inventories with different source versions
    await seedIsp({ unitId, publishStatus: "PUBLISHED", sourceVersion: BigInt(1) });
    await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));

    await seedIsp({ unitId, publishStatus: "PUBLISHED", sourceVersion: BigInt(5) });
    const result = await withTx((tx) =>
      rebuildUnitPublicProjection(tx, unitId, 1)
    );

    // Should use MAX(source_version) from grouped ISP rows
    expect(result.sourceVersion).toBe(BigInt(5));
  });
});

describe("H4 cross-inventory version regression", () => {
  async function getUnitRow(unitId: string) {
    const rows = await fixture.query<{
      from_price: string;
      matching_inventory_count: number;
      source_version: bigint | number | string;
    }>(
      `SELECT from_price, matching_inventory_count, source_version
       FROM unit_public_projection
       WHERE unit_id = $1`,
      [unitId]
    );
    return rows[0] ?? null;
  }

  it("recovers when the highest-versioned inventory is deleted", async () => {
    const unitId = `unit-h4-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    const invA = await seedIsp({ unitId, price: 1000, sourceVersion: BigInt(9) });
    await seedIsp({ unitId, price: 2000, sourceVersion: BigInt(2) });

    const first = await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));
    expect(first.matchingInventoryCount).toBe(2);
    expect(first.sourceVersion).toBe(BigInt(9));

    // Room A (the version-9 inventory) is deleted; only version-2 Room B remains
    await fixture.query(
      `DELETE FROM inventory_search_projection WHERE inventory_id = $1`,
      [invA]
    );

    const second = await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));
    expect(second.upserted).toBe(true);
    expect(second.matchingInventoryCount).toBe(1);
    expect(second.sourceVersion).toBe(BigInt(2));

    const row = await getUnitRow(unitId);
    expect(row).not.toBeNull();
    expect(row!.matching_inventory_count).toBe(1);
    expect(parseFloat(row!.from_price)).toBe(2000);
    expect(BigInt(row!.source_version)).toBe(BigInt(2));
  });

  it("keeps accepting subsequent updates after the regression (not stuck in the past)", async () => {
    const unitId = `unit-h4-stuck-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    const invA = await seedIsp({ unitId, price: 1000, sourceVersion: BigInt(9) });
    const invB = await seedIsp({ unitId, price: 2000, sourceVersion: BigInt(2) });

    await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));
    await fixture.query(
      `DELETE FROM inventory_search_projection WHERE inventory_id = $1`,
      [invA]
    );
    await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));

    // Room B updates with its own (still low) version counter
    await fixture.query(
      `UPDATE inventory_search_projection
       SET price = 1800, source_version = 3
       WHERE inventory_id = $1`,
      [invB]
    );

    const result = await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));
    expect(result.upserted).toBe(true);

    const row = await getUnitRow(unitId);
    expect(parseFloat(row!.from_price)).toBe(1800);
    expect(BigInt(row!.source_version)).toBe(BigInt(3));
  });

  it("regroups the unit row when the max-version inventory is tombstoned end-to-end", async () => {
    const unitId = `unit-h4-tomb-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    const invA = await seedIsp({ unitId, price: 1000, sourceVersion: BigInt(9) });
    await seedIsp({ unitId, price: 2000, sourceVersion: BigInt(2) });

    await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId: invA,
        reason: "TOMBSTONE",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(9),
      })
    );

    expect(result.skippedStale).toBe(false);
    expect(result.deletedInventoryRows).toBe(1);
    expect(result.unitRowDeleted).toBe(false);

    const row = await getUnitRow(unitId);
    expect(row).not.toBeNull();
    expect(row!.matching_inventory_count).toBe(1);
    expect(parseFloat(row!.from_price)).toBe(2000);
  });
});
