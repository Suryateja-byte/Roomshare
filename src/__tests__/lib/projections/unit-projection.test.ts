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

  it("uses GREATEST for source_version on conflict", async () => {
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
