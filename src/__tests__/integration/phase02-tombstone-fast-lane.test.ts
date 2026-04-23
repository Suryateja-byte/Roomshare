/**
 * @jest-environment node
 *
 * AC 4: Tombstone fast-lane — TOMBSTONE/SUPPRESSION/PAUSE events are processed at priority=0
 * and remove projection rows promptly.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { HANDLERS, type OutboxRow } from "@/lib/outbox/handlers";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";
import type { TransactionClient } from "@/lib/db/with-actor";

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

function makeTombstoneEvent(
  kind: "TOMBSTONE" | "SUPPRESSION" | "PAUSE",
  unitId: string,
  inventoryId: string | null
): OutboxRow {
  return {
    id: `ev-ts-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: unitId,
    kind,
    payload: inventoryId ? { inventoryId } : {},
    sourceVersion: BigInt(2),
    unitIdentityEpoch: 1,
    priority: 0, // tombstone fast-lane
    attemptCount: 0,
    createdAt: new Date(),
  };
}

async function seedUnitWithPublishedIsp(unitId: string): Promise<string> {
  const invId = `inv-${unitId}`;
  await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
  await fixture.insertInventorySearchProjection({
    id: invId,
    inventoryId: invId,
    unitId,
    publishStatus: "PUBLISHED",
    sourceVersion: BigInt(1),
  });
  // Build UPP
  await withTx((tx) => {
    const { rebuildUnitPublicProjection } = require("@/lib/projections/unit-projection");
    return rebuildUnitPublicProjection(tx, unitId, 1);
  });
  return invId;
}

describe("AC 4: Tombstone fast-lane", () => {
  it("TOMBSTONE removes ISP row", async () => {
    const unitId = `unit-tb4-${Date.now()}`;
    const invId = await seedUnitWithPublishedIsp(unitId);

    const event = makeTombstoneEvent("TOMBSTONE", unitId, invId);
    const result = await withTx((tx) => HANDLERS.TOMBSTONE(tx, event));
    expect(result.outcome).toBe("completed");

    const ispRows = await fixture.getInventorySearchProjections();
    expect(ispRows.find((r) => r.inventoryId === invId)).toBeUndefined();
  });

  it("SUPPRESSION removes ISP row", async () => {
    const unitId = `unit-sup4-${Date.now()}`;
    const invId = await seedUnitWithPublishedIsp(unitId);

    const event = makeTombstoneEvent("SUPPRESSION", unitId, invId);
    const result = await withTx((tx) => HANDLERS.SUPPRESSION(tx, event));
    expect(result.outcome).toBe("completed");

    const ispRows = await fixture.getInventorySearchProjections();
    expect(ispRows.find((r) => r.inventoryId === invId)).toBeUndefined();
  });

  it("PAUSE removes ISP row", async () => {
    const unitId = `unit-pse4-${Date.now()}`;
    const invId = await seedUnitWithPublishedIsp(unitId);

    const event = makeTombstoneEvent("PAUSE", unitId, invId);
    const result = await withTx((tx) => HANDLERS.PAUSE(tx, event));
    expect(result.outcome).toBe("completed");

    const ispRows = await fixture.getInventorySearchProjections();
    expect(ispRows.find((r) => r.inventoryId === invId)).toBeUndefined();
  });

  it("tombstone removes UPP when last inventory is hidden", async () => {
    const unitId = `unit-tb-upp-${Date.now()}`;
    const invId = await seedUnitWithPublishedIsp(unitId);

    const event = makeTombstoneEvent("TOMBSTONE", unitId, invId);
    await withTx((tx) => HANDLERS.TOMBSTONE(tx, event));

    const upps = await fixture.getUnitPublicProjections();
    expect(upps.find((r) => r.unitId === unitId)).toBeUndefined();
  });

  it("tombstone creates cache_invalidations row", async () => {
    const unitId = `unit-tb-ci-${Date.now()}`;
    const invId = await seedUnitWithPublishedIsp(unitId);

    const event = makeTombstoneEvent("TOMBSTONE", unitId, invId);
    await withTx((tx) => HANDLERS.TOMBSTONE(tx, event));

    const ci = await fixture.getCacheInvalidations();
    const row = ci.find((r) => r.unitId === unitId);
    expect(row).toBeDefined();
    expect(row!.reason).toBe("TOMBSTONE");
  });

  it("tombstone enqueues CACHE_INVALIDATE at priority=10", async () => {
    const unitId = `unit-tb-prio-${Date.now()}`;
    const invId = await seedUnitWithPublishedIsp(unitId);

    const event = makeTombstoneEvent("TOMBSTONE", unitId, invId);
    await withTx((tx) => HANDLERS.TOMBSTONE(tx, event));

    const outbox = await fixture.getOutboxEvents();
    const ciEvent = outbox.find(
      (e) => e.kind === "CACHE_INVALIDATE" && e.aggregateId === unitId
    );
    expect(ciEvent).toBeDefined();
    expect(ciEvent!.priority).toBe(10);
  });
});
