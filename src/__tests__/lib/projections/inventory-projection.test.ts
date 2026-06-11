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
const originalPhase03ProjectionWrites =
  process.env.FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES;

beforeAll(async () => {
  process.env.FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES = "false";
  fixture = await createPGlitePhase02Fixture();
  __setProjectionEpochForTesting(BigInt(1));
}, 30_000);

afterAll(async () => {
  await fixture.close();
  __setProjectionEpochForTesting(null);
  if (originalPhase03ProjectionWrites === undefined) {
    delete process.env.FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES;
  } else {
    process.env.FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES =
      originalPhase03ProjectionWrites;
  }
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
    expect(staleResult.skipReason).toBe("stale_version");

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

    // The publish transition must also survive the replay (idempotent CAS)
    const rows = await fixture.query(
      `SELECT publish_status FROM listing_inventories WHERE id = '${invId}'`
    );
    expect(rows[0].publish_status).toBe("PUBLISHED");
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

describe("H3 ghost-update guards", () => {
  async function expectNoProjectionRow(invId: string): Promise<void> {
    const rows = await fixture.getInventorySearchProjections();
    expect(rows.find((r) => r.inventoryId === invId)).toBeUndefined();
  }

  async function getPublishStatus(invId: string): Promise<string> {
    const rows = await fixture.query(
      `SELECT publish_status FROM listing_inventories WHERE id = '${invId}'`
    );
    return rows[0].publish_status as string;
  }

  it.each(["PAUSED", "SUPPRESSED", "ARCHIVED"] as const)(
    "skips a stale event against a %s inventory without writing a projection row",
    async (hiddenStatus) => {
      const { unitId, invId } = await seedInventory({
        publishStatus: hiddenStatus,
        sourceVersion: BigInt(6),
      });

      const result = await withTx((tx) =>
        rebuildInventorySearchProjection(tx, {
          unitId,
          inventoryId: invId,
          sourceVersion: BigInt(5),
          unitIdentityEpoch: 1,
        })
      );

      expect(result.updated).toBe(false);
      expect(result.skippedStale).toBe(true);
      expect(result.skipReason).toBe("hidden_status");
      await expectNoProjectionRow(invId);
      expect(await getPublishStatus(invId)).toBe(hiddenStatus);
    }
  );

  it("does not recreate a tombstone-deleted projection row (H3 interleaving)", async () => {
    const { unitId, invId } = await seedInventory({
      publishStatus: "PENDING_PROJECTION",
      sourceVersion: BigInt(5),
    });

    // Event published normally first
    const first = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(5),
        unitIdentityEpoch: 1,
      })
    );
    expect(first.updated).toBe(true);

    // Moderator pause commits: hides the inventory and tombstones the projection
    await fixture.query(
      `UPDATE listing_inventories SET publish_status = 'PAUSED', source_version = 6 WHERE id = $1`,
      [invId]
    );
    await fixture.query(
      `DELETE FROM inventory_search_projection WHERE inventory_id = $1`,
      [invId]
    );

    // A stale/replayed event must not resurrect the listing
    const replay = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(5),
        unitIdentityEpoch: 1,
      })
    );

    expect(replay.updated).toBe(false);
    expect(replay.skipReason).toBe("hidden_status");
    await expectNoProjectionRow(invId);
    expect(await getPublishStatus(invId)).toBe("PAUSED");
  });

  it("allows a legitimate re-publish after the host unpauses", async () => {
    const { unitId, invId } = await seedInventory({
      publishStatus: "PAUSED",
      sourceVersion: BigInt(6),
    });

    // Stale event while paused: skipped
    const whilePaused = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(5),
        unitIdentityEpoch: 1,
      })
    );
    expect(whilePaused.skipReason).toBe("hidden_status");

    // Host unpauses → canonical sync sets PENDING_PROJECTION at a newer version
    await fixture.query(
      `UPDATE listing_inventories SET publish_status = 'PENDING_PROJECTION', source_version = 7 WHERE id = $1`,
      [invId]
    );

    const republish = await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(7),
        unitIdentityEpoch: 1,
      })
    );

    expect(republish.updated).toBe(true);
    expect(republish.targetStatus).toBe("PUBLISHED");
    expect(await getPublishStatus(invId)).toBe("PUBLISHED");

    const rows = await fixture.getInventorySearchProjections();
    const row = rows.find((r) => r.inventoryId === invId);
    expect(row).toBeDefined();
    expect(row!.sourceVersion).toBe(BigInt(7));
  });
});
