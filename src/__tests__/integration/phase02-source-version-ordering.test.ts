/**
 * @jest-environment node
 *
 * AC 6: Source-version ordering — stale events skip projection writes,
 * preventing out-of-order updates from corrupting projections.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { rebuildInventorySearchProjection } from "@/lib/projections/inventory-projection";
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

async function seedInventory(unitId: string): Promise<{ unitId: string; invId: string }> {
  const canonHash = `hash-${unitId}`;
  await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
  const invId = await fixture.insertListingInventory({
    unitId,
    canonicalAddressHash: canonHash,
    roomCategory: "PRIVATE_ROOM",
    capacityGuests: 2,
  });
  await fixture.query(
    `UPDATE listing_inventories
     SET publish_status = 'PENDING_PROJECTION', source_version = 10
     WHERE id = $1`,
    [invId]
  );
  return { unitId, invId };
}

describe("AC 6: Source-version ordering", () => {
  it("higher source_version wins over lower (out-of-order delivery)", async () => {
    const unitId = `unit-svo-${Date.now()}`;
    const { invId } = await seedInventory(unitId);

    // Write version=10 first
    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(10),
        unitIdentityEpoch: 1,
      })
    );

    // Write stale version=3 — should be skipped
    const staleResult = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(3),
        unitIdentityEpoch: 1,
      })
    );

    expect(staleResult.skippedStale).toBe(true);

    // ISP row still has version=10
    const rows = await fixture.getInventorySearchProjections();
    const row = rows.find((r) => r.inventoryId === invId);
    expect(row!.sourceVersion).toBe(BigInt(10));
  });

  it("equal version is idempotent (processed again does not corrupt)", async () => {
    const unitId = `unit-svo-eq-${Date.now()}`;
    const { invId } = await seedInventory(unitId);

    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(5),
        unitIdentityEpoch: 1,
      })
    );

    const result = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(5),
        unitIdentityEpoch: 1,
      })
    );

    expect(result.updated).toBe(true);
    expect(result.skippedStale).toBe(false);
  });

  it("newer version overwrites older projection", async () => {
    const unitId = `unit-svo-new-${Date.now()}`;
    const { invId } = await seedInventory(unitId);

    // Write version=1
    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    // Write version=2 (newer)
    const result = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(2),
        unitIdentityEpoch: 1,
      })
    );

    expect(result.updated).toBe(true);
    expect(result.skippedStale).toBe(false);

    const rows = await fixture.getInventorySearchProjections();
    const row = rows.find((r) => r.inventoryId === invId);
    expect(row!.sourceVersion).toBe(BigInt(2));
  });

  it("stale delivery does not overwrite published status back to pending", async () => {
    const unitId = `unit-svo-status-${Date.now()}`;
    const { invId } = await seedInventory(unitId);

    // Publish with version=5
    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(5),
        unitIdentityEpoch: 1,
      })
    );

    let rows = await fixture.getInventorySearchProjections();
    expect(rows.find((r) => r.inventoryId === invId)!.publishStatus).toBe("PUBLISHED");

    // Stale delivery with version=2 should not change status
    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(2),
        unitIdentityEpoch: 1,
      })
    );

    rows = await fixture.getInventorySearchProjections();
    expect(rows.find((r) => r.inventoryId === invId)!.publishStatus).toBe("PUBLISHED");
  });
});
