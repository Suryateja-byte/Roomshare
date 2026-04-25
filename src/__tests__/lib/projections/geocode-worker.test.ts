/**
 * @jest-environment node
 *
 * Tests for src/lib/projections/geocode-worker.ts
 * Uses PGlite Phase 02 fixture + mocked geocodeAddress.
 */

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import {
  handleGeocodeNeeded,
  type GeocodeOutboxEvent,
} from "@/lib/projections/geocode-worker";
import type { TransactionClient } from "@/lib/db/with-actor";
import type { geocodeAddress } from "@/lib/geocoding";

let fixture: Phase02Fixture;

beforeAll(async () => {
  fixture = await createPGlitePhase02Fixture();
}, 30_000);

afterAll(async () => {
  await fixture.close();
});

async function withTx<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return fixture.client.$transaction((tx) => fn(tx as unknown as TransactionClient));
}

function makeEvent(overrides?: Partial<GeocodeOutboxEvent>): GeocodeOutboxEvent {
  return {
    id: `ev-${Date.now()}`,
    aggregateType: "PHYSICAL_UNIT",
    aggregateId: `unit-gc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    payload: { address: "123 Test St, Sydney NSW 2000", requestId: null },
    attemptCount: 0,
    ...overrides,
  };
}

type GeocodeFn = typeof geocodeAddress;

function mockSuccess(lat = -33.8688, lng = 151.2099): jest.MockedFunction<GeocodeFn> {
  return jest.fn().mockResolvedValue({ status: "success", lat, lng });
}

function mockNotFound(): jest.MockedFunction<GeocodeFn> {
  return jest.fn().mockResolvedValue({ status: "not_found" });
}

function mockError(): jest.MockedFunction<GeocodeFn> {
  return jest.fn().mockResolvedValue({ status: "error" });
}

function mockThrow(err = new Error("Network error")): jest.MockedFunction<GeocodeFn> {
  return jest.fn().mockRejectedValue(err);
}

describe("handleGeocodeNeeded()", () => {
  it("returns success and updates physical_units geocode columns", async () => {
    const event = makeEvent();
    const canonHash = `hash-${event.aggregateId}`;
    await fixture.insertPhysicalUnit({
      id: event.aggregateId,
      canonicalAddressHash: canonHash,
    });

    const outcome = await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockSuccess(-33.8688, 151.2099) })
    );

    expect(outcome.status).toBe("success");
    if (outcome.status === "success") {
      expect(outcome.publishedStatus).toBe("PENDING_PROJECTION");
    }

    const rows = await fixture.query(
      `SELECT exact_point, public_point, public_cell_id FROM physical_units WHERE id = '${event.aggregateId}'`
    );
    expect(rows[0].exact_point).toContain("151.2099");
    expect(rows[0].public_cell_id).toBeTruthy();
  });

  it("transitions PENDING_GEOCODE inventories to PENDING_PROJECTION on success", async () => {
    const event = makeEvent();
    const unitId = event.aggregateId;
    const canonHash = `hash-${unitId}`;

    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
    // Insert a listing inventory in PENDING_GEOCODE state
    const invId = await fixture.insertListingInventory({
      unitId,
      canonicalAddressHash: canonHash,
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: 2,
    });
    await fixture.query(
      `UPDATE listing_inventories SET publish_status = 'PENDING_GEOCODE' WHERE id = '${invId}'`
    );

    await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockSuccess() })
    );

    const rows = await fixture.query(
      `SELECT publish_status FROM listing_inventories WHERE id = '${invId}'`
    );
    expect(rows[0].publish_status).toBe("PENDING_PROJECTION");
  });

  it("enqueues INVENTORY_UPSERTED outbox events for transitioned inventories", async () => {
    const event = makeEvent();
    const unitId = event.aggregateId;
    const canonHash = `hash-${unitId}`;

    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
    await fixture.insertListingInventory({
      unitId,
      canonicalAddressHash: canonHash,
      roomCategory: "PRIVATE_ROOM",
      capacityGuests: 2,
    });
    await fixture.query(
      `UPDATE listing_inventories SET publish_status = 'PENDING_GEOCODE' WHERE unit_id = '${unitId}'`
    );

    await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockSuccess() })
    );

    const outbox = await fixture.getOutboxEvents();
    const invEvent = outbox.find(
      (e) => e.kind === "INVENTORY_UPSERTED" && e.payload.unitId === unitId
    );
    expect(invEvent).toBeDefined();
  });

  it("returns not_found when geocodeAddress returns not_found", async () => {
    const event = makeEvent();
    const unitId = event.aggregateId;

    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });

    const outcome = await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockNotFound() })
    );

    expect(outcome.status).toBe("not_found");

    // geocode_status should be NOT_FOUND in physical_units
    const rows = await fixture.query(
      `SELECT geocode_status FROM physical_units WHERE id = '${unitId}'`
    );
    expect(rows[0].geocode_status).toBe("NOT_FOUND");
  });

  it("returns transient_error when geocodeAddress returns error and attemptCount < MAX", async () => {
    const event = makeEvent({ attemptCount: 2 });
    const unitId = event.aggregateId;

    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });

    const outcome = await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockError() })
    );

    expect(outcome.status).toBe("transient_error");
    if (outcome.status === "transient_error") {
      expect(outcome.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("returns exhausted when geocodeAddress returns error and attemptCount >= MAX_ATTEMPTS", async () => {
    const event = makeEvent({ attemptCount: 8 });
    const unitId = event.aggregateId;

    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });

    const outcome = await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockError() })
    );

    expect(outcome.status).toBe("exhausted");
    if (outcome.status === "exhausted") {
      expect(outcome.dlqReason).toBe("GEOCODE_EXHAUSTED");
    }
  });

  it("returns transient_error when geocodeAddress throws and attemptCount < MAX", async () => {
    const event = makeEvent({ attemptCount: 1 });
    const unitId = event.aggregateId;

    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });

    const outcome = await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockThrow() })
    );

    expect(outcome.status).toBe("transient_error");
  });

  it("returns exhausted when geocodeAddress throws and attemptCount >= MAX_ATTEMPTS", async () => {
    const event = makeEvent({ attemptCount: 8 });
    const unitId = event.aggregateId;

    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });

    const outcome = await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockThrow() })
    );

    expect(outcome.status).toBe("exhausted");
  });

  it("coarsens lat/lng to 2 decimal places for public_cell_id", async () => {
    const event = makeEvent();
    const unitId = event.aggregateId;

    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });

    await withTx((tx) =>
      handleGeocodeNeeded(tx, event, { geocode: mockSuccess(-33.8765, 151.2345) })
    );

    const rows = await fixture.query(
      `SELECT public_cell_id FROM physical_units WHERE id = '${unitId}'`
    );
    // Should be rounded to 2dp
    expect(rows[0].public_cell_id).toBe("-33.88,151.23");
  });
});
