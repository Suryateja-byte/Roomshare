/**
 * @jest-environment node
 *
 * AC 5: Geocode-pending flow — GEOCODE_NEEDED outbox event → physical_units updated →
 * listing_inventories transitioned PENDING_GEOCODE → PENDING_PROJECTION →
 * INVENTORY_UPSERTED enqueued.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { HANDLERS, type OutboxRow } from "@/lib/outbox/handlers";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";
import type { TransactionClient } from "@/lib/db/with-actor";
import type { geocodeAddress } from "@/lib/geocoding";

jest.mock("@sentry/nextjs", () => ({ addBreadcrumb: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { sync: { info: jest.fn(), warn: jest.fn() } },
}));

// Mock geocodeAddress at module level
jest.mock("@/lib/geocoding", () => ({
  geocodeAddress: jest.fn(),
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

function makeGeocodeEvent(unitId: string, attemptCount = 0): OutboxRow {
  return {
    id: `ev-gc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: unitId,
    kind: "GEOCODE_NEEDED",
    payload: { address: "123 Test St, Sydney NSW 2000" },
    sourceVersion: BigInt(1),
    unitIdentityEpoch: 1,
    priority: 100,
    attemptCount,
    createdAt: new Date(),
  };
}

describe("AC 5: Geocode-pending flow", () => {
  it("successful geocode updates physical_units and transitions inventories", async () => {
    const { geocodeAddress } = require("@/lib/geocoding");
    geocodeAddress.mockResolvedValue({ status: "success", lat: -33.8688, lng: 151.2099 });

    const unitId = `unit-gc5-${Date.now()}`;
    const canonHash = `hash-${unitId}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
    // Insert inventory in PENDING_GEOCODE
    await fixture.insertListingInventory({
      unitId,
      canonicalAddressHash: canonHash,
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: 2,
    });
    await fixture.query(
      `UPDATE listing_inventories SET publish_status = 'PENDING_GEOCODE' WHERE unit_id = '${unitId}'`
    );

    const event = makeGeocodeEvent(unitId);
    const result = await withTx((tx) => HANDLERS.GEOCODE_NEEDED(tx, event));

    expect(result.outcome).toBe("completed");

    // physical_units should have geocode data
    const units = await fixture.query(
      `SELECT exact_point, public_cell_id FROM physical_units WHERE id = '${unitId}'`
    );
    expect(units[0].exact_point).toContain("POINT");
    expect(units[0].public_cell_id).toBeTruthy();

    // Inventories should be PENDING_PROJECTION
    const invRows = await fixture.query(
      `SELECT publish_status FROM listing_inventories WHERE unit_id = '${unitId}'`
    );
    expect(invRows[0].publish_status).toBe("PENDING_PROJECTION");

    // INVENTORY_UPSERTED should be enqueued
    const outbox = await fixture.getOutboxEvents();
    const invEvent = outbox.find(
      (e) => e.kind === "INVENTORY_UPSERTED" && (e.payload.unitId as string) === unitId
    );
    expect(invEvent).toBeDefined();
  });

  it("not_found geocode completes without transitioning inventories", async () => {
    const { geocodeAddress } = require("@/lib/geocoding");
    geocodeAddress.mockResolvedValue({ status: "not_found" });

    const unitId = `unit-gc5-nf-${Date.now()}`;
    const canonHash = `hash-${unitId}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });

    const event = makeGeocodeEvent(unitId);
    const result = await withTx((tx) => HANDLERS.GEOCODE_NEEDED(tx, event));

    expect(result.outcome).toBe("completed");

    // geocode_status should be NOT_FOUND
    const units = await fixture.query(
      `SELECT geocode_status FROM physical_units WHERE id = '${unitId}'`
    );
    expect(units[0].geocode_status).toBe("NOT_FOUND");
  });

  it("transient geocode error returns transient_error outcome", async () => {
    const { geocodeAddress } = require("@/lib/geocoding");
    geocodeAddress.mockResolvedValue({ status: "error" });

    const unitId = `unit-gc5-err-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });

    const event = makeGeocodeEvent(unitId, 1);
    const result = await withTx((tx) => HANDLERS.GEOCODE_NEEDED(tx, event));

    expect(result.outcome).toBe("transient_error");
  });

  it("exhausted geocode (MAX_ATTEMPTS) routes to DLQ outcome", async () => {
    const { geocodeAddress } = require("@/lib/geocoding");
    geocodeAddress.mockResolvedValue({ status: "error" });

    const unitId = `unit-gc5-dlq-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });

    const event = makeGeocodeEvent(unitId, 8); // >= MAX_ATTEMPTS
    const result = await withTx((tx) => HANDLERS.GEOCODE_NEEDED(tx, event));

    expect(result.outcome).toBe("fatal_error");
    if (result.outcome === "fatal_error") {
      expect(result.dlqReason).toBe("GEOCODE_EXHAUSTED");
    }
  });
});
