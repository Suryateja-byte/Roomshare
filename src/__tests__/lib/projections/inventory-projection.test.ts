/**
 * @jest-environment node
 *
 * Tests for src/lib/projections/inventory-projection.ts
 * Uses PGlite Phase 02 fixture (real Postgres engine).
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { rebuildInventorySearchProjection } from "@/lib/projections/inventory-projection";
import {
  __setProjectionEpochForTesting,
} from "@/lib/projections/epoch";
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

/** Run fn inside fixture.$transaction */
async function withTx<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return fixture.client.$transaction((tx) => fn(tx as unknown as TransactionClient));
}

/** Insert a physical unit + listing inventory, optionally set publish_status. */
async function seedInventory(opts: {
  unitId?: string;
  invId?: string;
  publishStatus?: string;
  sourceVersion?: bigint;
}): Promise<{ unitId: string; invId: string }> {
  const unitId = opts.unitId ?? `unit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const invId = opts.invId ?? `inv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const canonHash = `hash-${unitId}`;

  await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
  await fixture.insertListingInventory({
    id: invId,
    unitId,
    canonicalAddressHash: canonHash,
    roomCategory: "PRIVATE_ROOM",
    capacityGuests: 2,
  });

  // Phase 01 fixture doesn't expose publishStatus/sourceVersion params; set via SQL
  if (opts.publishStatus && opts.publishStatus !== "DRAFT") {
    await fixture.query(
      `UPDATE listing_inventories SET publish_status = $1 WHERE id = $2`,
      [opts.publishStatus, invId]
    );
  }
  if (opts.sourceVersion !== undefined) {
    await fixture.query(
      `UPDATE listing_inventories SET source_version = $1 WHERE id = $2`,
      [Number(opts.sourceVersion), invId]
    );
  }

  return { unitId, invId };
}

describe("rebuildInventorySearchProjection()", () => {
  it("creates a new ISP row for a PENDING_PROJECTION inventory", async () => {
    const { unitId, invId } = await seedInventory({ publishStatus: "PENDING_PROJECTION" });

    const result = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    expect(result.updated).toBe(true);
    expect(result.skippedStale).toBe(false);
    expect(result.targetStatus).toBe("PUBLISHED");

    const rows = await fixture.getInventorySearchProjections();
    const row = rows.find((r) => r.inventoryId === invId);
    expect(row).toBeDefined();
    expect(row!.publishStatus).toBe("PUBLISHED");
    expect(row!.sourceVersion).toBe(BigInt(1));
  });

  it("transitions PENDING_PROJECTION to PUBLISHED in listing_inventories", async () => {
    const { unitId, invId } = await seedInventory({ publishStatus: "PENDING_PROJECTION" });

    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    const rows = await fixture.query(
      `SELECT publish_status FROM listing_inventories WHERE id = '${invId}'`
    );
    expect(rows[0].publish_status).toBe("PUBLISHED");
  });

  it("transitions PENDING_EMBEDDING to PUBLISHED", async () => {
    const { unitId, invId } = await seedInventory({ publishStatus: "PENDING_EMBEDDING" });

    const result = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    expect(result.targetStatus).toBe("PUBLISHED");
  });

  it("preserves PENDING_GEOCODE status (does not publish)", async () => {
    const { unitId, invId } = await seedInventory({ publishStatus: "PENDING_GEOCODE" });

    const result = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    expect(result.targetStatus).toBe("PENDING_GEOCODE");
    // Status should NOT flip in listing_inventories
    const rows = await fixture.query(
      `SELECT publish_status FROM listing_inventories WHERE id = '${invId}'`
    );
    expect(rows[0].publish_status).toBe("PENDING_GEOCODE");
  });

  it("returns skippedStale=true when a newer sourceVersion already exists", async () => {
    const { unitId, invId } = await seedInventory({
      publishStatus: "PENDING_PROJECTION",
      sourceVersion: BigInt(5),
    });

    // First write with version=5
    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(5),
        unitIdentityEpoch: 1,
      })
    );

    // Try to write stale version=2 — should be skipped
    const staleResult = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(2),
        unitIdentityEpoch: 1,
      })
    );

    expect(staleResult.skippedStale).toBe(true);
    expect(staleResult.updated).toBe(false);

    // ISP row should still have version=5
    const rows = await fixture.getInventorySearchProjections();
    const row = rows.find((r) => r.inventoryId === invId);
    expect(row!.sourceVersion).toBe(BigInt(5));
  });

  it("allows idempotent rewrite with equal sourceVersion", async () => {
    const { unitId, invId } = await seedInventory({ publishStatus: "PENDING_PROJECTION" });

    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(3),
        unitIdentityEpoch: 1,
      })
    );

    // Same version again — idempotent
    const result = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(3),
        unitIdentityEpoch: 1,
      })
    );

    expect(result.updated).toBe(true);
    expect(result.skippedStale).toBe(false);
  });

  it("returns skippedStale=true when inventory does not exist", async () => {
    const unitId = `unit-missing-${Date.now()}`;
    const invId = `inv-missing-${Date.now()}`;

    const result = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    expect(result.skippedStale).toBe(true);
    expect(result.updated).toBe(false);
  });

  it("copies geocode fields from physical_units when available", async () => {
    const { unitId, invId } = await seedInventory({ publishStatus: "PENDING_PROJECTION" });

    await fixture.query(`
      UPDATE physical_units
      SET public_point = 'POINT(151.21 -33.87)',
          public_cell_id = '-33.87,151.21',
          public_area_name = 'Sydney CBD'
      WHERE id = '${unitId}'
    `);

    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    const rows = await fixture.query(
      `SELECT public_cell_id, public_area_name FROM inventory_search_projection WHERE inventory_id = '${invId}'`
    );
    expect(rows[0].public_cell_id).toBe("-33.87,151.21");
    expect(rows[0].public_area_name).toBe("Sydney CBD");
  });

  it("records projection_epoch from currentProjectionEpoch()", async () => {
    __setProjectionEpochForTesting(BigInt(42));
    const { unitId, invId } = await seedInventory({ publishStatus: "PENDING_PROJECTION" });

    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    const rows = await fixture.getInventorySearchProjections();
    const row = rows.find((r) => r.inventoryId === invId);
    expect(row!.projectionEpoch).toBe(BigInt(42));
  });
});
