/**
 * @jest-environment node
 *
 * AC 1: INVENTORY_UPSERTED outbox event → inventory_search_projection + unit_public_projection
 * AC 2: Unit public projection aggregates all visible inventories for a unit
 * End-to-end: outbox event → projection tables pipeline
 *
 * Uses PGlite Phase 02 fixture; does NOT use drainOutboxOnce (which requires real Prisma).
 * Instead, calls HANDLERS directly to simulate drain worker behavior.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { HANDLERS, type OutboxRow } from "@/lib/outbox/handlers";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";
import type { TransactionClient } from "@/lib/db/with-actor";

// Mock Sentry + logger used by handlers
jest.mock("@sentry/nextjs", () => ({ addBreadcrumb: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { sync: { info: jest.fn(), warn: jest.fn() } },
}));

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
  jest.clearAllMocks();
});

async function withTx<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return fixture.client.$transaction((tx) => fn(tx as unknown as TransactionClient));
}

function makeOutboxRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    aggregateType: "LISTING_INVENTORY",
    aggregateId: `unit-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: "INVENTORY_UPSERTED",
    payload: {},
    sourceVersion: BigInt(1),
    unitIdentityEpoch: 1,
    priority: 100,
    attemptCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Seed a unit + inventory with distinct ids, matching the production outbox contract.
 */
async function seedUnitWithInventory(
  unitId: string,
  publishStatus = "PENDING_PROJECTION"
): Promise<string> {
  const canonHash = `hash-${unitId}`;
  await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
  const inventoryId = await fixture.insertListingInventory({
    unitId,
    canonicalAddressHash: canonHash,
    roomCategory: "PRIVATE_ROOM",
    capacityGuests: 2,
  });
  await fixture.query(
    `UPDATE listing_inventories SET publish_status = $1 WHERE id = $2`,
    [publishStatus, inventoryId]
  );
  return inventoryId;
}

describe("AC 1: INVENTORY_UPSERTED → ISP + UPP", () => {
  it("creates ISP row in PUBLISHED status after INVENTORY_UPSERTED", async () => {
    const unitId = `unit-ac1-${Date.now()}`;
    const inventoryId = await seedUnitWithInventory(unitId);

    const event = makeOutboxRow({
      kind: "INVENTORY_UPSERTED",
      aggregateId: inventoryId,
      payload: { unitId },
      sourceVersion: BigInt(1),
    });

    const result = await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event));
    expect(result.outcome).toBe("completed");

    const ispRows = await fixture.getInventorySearchProjections();
    const isp = ispRows.find((r) => r.inventoryId === inventoryId);
    expect(isp).toBeDefined();
    expect(isp!.unitId).toBe(unitId);
    expect(isp!.publishStatus).toBe("PUBLISHED");
  });

  it("creates UPP row after INVENTORY_UPSERTED completes", async () => {
    const unitId = `unit-ac1b-${Date.now()}`;
    const inventoryId = await seedUnitWithInventory(unitId);

    const event = makeOutboxRow({
      kind: "INVENTORY_UPSERTED",
      aggregateId: inventoryId,
      payload: { unitId },
    });

    await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event));

    const upps = await fixture.getUnitPublicProjections();
    const upp = upps.find((r) => r.unitId === unitId);
    expect(upp).toBeDefined();
    expect(upp!.matchingInventoryCount).toBe(1);
  });

  it("inserts a cache_invalidations row after successful publish", async () => {
    const unitId = `unit-ci-${Date.now()}`;
    const inventoryId = await seedUnitWithInventory(unitId);

    const event = makeOutboxRow({
      kind: "INVENTORY_UPSERTED",
      aggregateId: inventoryId,
      payload: { unitId },
    });
    await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event));

    const ci = await fixture.getCacheInvalidations();
    const ciRow = ci.find((r) => r.unitId === unitId && r.reason === "REPUBLISH");
    expect(ciRow).toBeDefined();
  });
});

describe("AC 2: Unit projection aggregates multiple inventories", () => {
  it("counts all PUBLISHED inventories for a unit", async () => {
    const unitId = `unit-multi-ac2-${Date.now()}`;
    const canonHash = `hash-${unitId}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });

    // Seed 3 published ISP rows for the same unit
    for (let i = 0; i < 3; i++) {
      await fixture.insertInventorySearchProjection({
        unitId,
        publishStatus: "PUBLISHED",
        sourceVersion: BigInt(i + 1),
      });
    }

    // Trigger unit projection rebuild
    const event = makeOutboxRow({ kind: "UNIT_UPSERTED", aggregateId: unitId });
    await withTx((tx) => HANDLERS.UNIT_UPSERTED(tx, event));

    const upps = await fixture.getUnitPublicProjections();
    const upp = upps.find((r) => r.unitId === unitId);
    expect(upp).toBeDefined();
    expect(upp!.matchingInventoryCount).toBe(3);
  });
});

describe("AC 3: Publish state machine transitions", () => {
  it("DRAFT status is preserved (no transition without geocode)", async () => {
    const unitId = `unit-draft-${Date.now()}`;
    const inventoryId = await seedUnitWithInventory(unitId, "DRAFT");

    const event = makeOutboxRow({
      kind: "INVENTORY_UPSERTED",
      aggregateId: inventoryId,
      payload: { unitId },
    });
    const result = await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event));
    expect(result.outcome).toBe("completed");

    // ISP should have DRAFT status
    const ispRows = await fixture.getInventorySearchProjections();
    const isp = ispRows.find((r) => r.inventoryId === inventoryId);
    expect(isp?.publishStatus).toBe("DRAFT");
  });
});

describe("Stale event handling", () => {
  it("returns stale_skipped when newer source_version already in ISP", async () => {
    const unitId = `unit-stale-e2e-${Date.now()}`;
    const inventoryId = await seedUnitWithInventory(unitId);

    // Write version=5 first
    const event5 = makeOutboxRow({
      kind: "INVENTORY_UPSERTED",
      aggregateId: inventoryId,
      payload: { unitId },
      sourceVersion: BigInt(5),
    });
    await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event5));

    // Write stale version=1
    const event1 = makeOutboxRow({
      kind: "INVENTORY_UPSERTED",
      aggregateId: inventoryId,
      payload: { unitId },
      sourceVersion: BigInt(1),
    });
    const result = await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event1));
    expect(result.outcome).toBe("stale_skipped");
  });
});
