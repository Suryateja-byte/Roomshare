/**
 * @jest-environment node
 *
 * AC 8: Read-path isolation — projection tables are write-only from the drain worker;
 * the search read-path reads from inventory_search_projection, not listing_inventories.
 *
 * Verifies:
 *   1. inventory_search_projection contains only explicitly published rows
 *   2. listing_inventories changes don't appear in ISP until a drain cycle
 *   3. Unit public projection reflects only PUBLISHED / STALE_PUBLISHED ISP rows
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { rebuildInventorySearchProjection } from "@/lib/projections/inventory-projection";
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

async function seedUnit(unitId: string): Promise<void> {
  await fixture.insertPhysicalUnit({
    id: unitId,
    canonicalAddressHash: `hash-${unitId}`,
  });
}

async function seedInv(
  unitId: string,
  publishStatus: string,
  sourceVersion = BigInt(1)
): Promise<string> {
  const invId = `inv-${unitId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await fixture.query(
    `INSERT INTO listing_inventories
       (id, unit_id, unit_identity_epoch_written_at, inventory_key,
        room_category, capacity_guests, available_from, availability_range, price,
        canonicalizer_version, canonical_address_hash, publish_status, source_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      invId, unitId, 1, `key-${invId}`,
      "PRIVATE_ROOM", 2, "2026-05-01",
      "[2026-05-01T00:00:00Z,2026-06-01T00:00:00Z)",
      1000, "v1", `hash-${unitId}`, publishStatus, Number(sourceVersion),
    ]
  );
  return invId;
}

describe("AC 8: Read-path isolation", () => {
  it("ISP row does not exist before drain cycle (pre-drain isolation)", async () => {
    const unitId = `unit-iso-${Date.now()}`;
    await seedUnit(unitId);
    await seedInv(unitId, "PENDING_PROJECTION");

    // ISP should be empty — no drain has run yet
    const ispRows = await fixture.getInventorySearchProjections();
    const found = ispRows.find((r) => r.unitId === unitId);
    expect(found).toBeUndefined();
  });

  it("ISP row appears only after explicit projection rebuild", async () => {
    const unitId = `unit-iso2-${Date.now()}`;
    await seedUnit(unitId);
    const invId = await seedInv(unitId, "PENDING_PROJECTION");

    // Rebuild (simulates drain worker)
    await withTx((tx) =>
      rebuildInventorySearchProjection(tx, {
        unitId,
        inventoryId: invId,
        sourceVersion: BigInt(1),
        unitIdentityEpoch: 1,
      })
    );

    const ispRows = await fixture.getInventorySearchProjections();
    expect(ispRows.find((r) => r.inventoryId === invId)).toBeDefined();
  });

  it("UPP only includes PUBLISHED rows, not PENDING_PROJECTION", async () => {
    const unitId = `unit-iso3-${Date.now()}`;
    await seedUnit(unitId);

    // Seed one PUBLISHED and one PENDING_PROJECTION ISP row
    await fixture.insertInventorySearchProjection({
      unitId,
      publishStatus: "PUBLISHED",
      sourceVersion: BigInt(1),
    });
    await fixture.insertInventorySearchProjection({
      unitId,
      publishStatus: "PENDING_PROJECTION",
      sourceVersion: BigInt(2),
    });

    // Build UPP
    const result = await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));

    // Should count only the PUBLISHED one
    expect(result.matchingInventoryCount).toBe(1);

    const upps = await fixture.getUnitPublicProjections();
    const upp = upps.find((r) => r.unitId === unitId);
    expect(upp!.matchingInventoryCount).toBe(1);
  });

  it("listing_inventories changes without drain are NOT visible in ISP", async () => {
    const unitId = `unit-iso4-${Date.now()}`;
    await seedUnit(unitId);
    const invId = await seedInv(unitId, "PENDING_PROJECTION");

    // Update listing_inventories directly (no drain)
    await fixture.query(
      `UPDATE listing_inventories SET price = 2000 WHERE id = '${invId}'`
    );

    // ISP should not have this unit
    const ispRows = await fixture.getInventorySearchProjections();
    expect(ispRows.find((r) => r.inventoryId === invId)).toBeUndefined();
  });
});
