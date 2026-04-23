/**
 * @jest-environment node
 *
 * Tests for src/lib/outbox/handlers.ts
 * Uses PGlite Phase 02 fixture.
 */

jest.mock("@sentry/nextjs", () => ({
  addBreadcrumb: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      info: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { HANDLERS, type OutboxRow } from "@/lib/outbox/handlers";
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
  jest.clearAllMocks();
  __setProjectionEpochForTesting(BigInt(1));
});

async function withTx<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return fixture.client.$transaction((tx) => fn(tx as unknown as TransactionClient));
}

function makeEvent(overrides: Partial<OutboxRow> = {}): OutboxRow {
  const now = new Date();
  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    aggregateType: "LISTING_INVENTORY",
    aggregateId: `unit-h-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: "INVENTORY_UPSERTED",
    payload: {},
    sourceVersion: BigInt(1),
    unitIdentityEpoch: 1,
    priority: 100,
    attemptCount: 0,
    createdAt: now,
    ...overrides,
  };
}

async function seedUnitAndInventory(unitId: string): Promise<string> {
  const canonHash = `hash-${unitId}`;
  await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
  const invId = await fixture.insertListingInventory({
    unitId,
    canonicalAddressHash: canonHash,
    roomCategory: "PRIVATE_ROOM",
    capacityGuests: 2,
  });
  await fixture.query(
    `UPDATE listing_inventories SET publish_status = 'PENDING_PROJECTION' WHERE id = '${invId}'`
  );
  return invId;
}

describe("HANDLERS routing table", () => {
  it("has handlers for all expected OutboxKind values", () => {
    const expectedKinds = [
      "UNIT_UPSERTED",
      "INVENTORY_UPSERTED",
      "IDENTITY_MUTATION",
      "TOMBSTONE",
      "SUPPRESSION",
      "PAUSE",
      "CACHE_INVALIDATE",
      "GEOCODE_NEEDED",
      "EMBED_NEEDED",
    ];
    for (const kind of expectedKinds) {
      expect(HANDLERS).toHaveProperty(kind);
      expect(typeof HANDLERS[kind as keyof typeof HANDLERS]).toBe("function");
    }
  });
});

describe("HANDLERS.INVENTORY_UPSERTED", () => {
  it("returns completed when inventory upserted successfully", async () => {
    const unitId = `unit-inv-h-${Date.now()}`;
    const invId = await seedUnitAndInventory(unitId);

    const event = makeEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateId: invId,
      payload: { unitId },
      sourceVersion: BigInt(1),
      unitIdentityEpoch: 1,
    });

    const result = await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event));
    expect(result.outcome).toBe("completed");

    const ispRows = await fixture.getInventorySearchProjections();
    expect(ispRows.find((row) => row.inventoryId === invId)?.unitId).toBe(unitId);

    const ciRows = await fixture.getCacheInvalidations();
    expect(ciRows.find((row) => row.unitId === unitId && row.reason === "REPUBLISH")).toBeDefined();
  });

  it("falls back to the inventory row when payload unitId is missing", async () => {
    const unitId = `unit-inv-fallback-${Date.now()}`;
    const invId = await seedUnitAndInventory(unitId);

    const event = makeEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateId: invId,
      payload: {},
      sourceVersion: BigInt(1),
      unitIdentityEpoch: 1,
    });

    const result = await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event));
    expect(result.outcome).toBe("completed");

    const uppRows = await fixture.getUnitPublicProjections();
    expect(uppRows.find((row) => row.unitId === unitId)).toBeDefined();
  });

  it("returns stale_skipped when inventory projection is newer", async () => {
    const unitId = `u-stale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const invId = await seedUnitAndInventory(unitId);

    // First write with version=5
    const event5 = makeEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateId: invId,
      payload: { unitId },
      sourceVersion: BigInt(5),
    });
    await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event5));

    // Second write with stale version=1
    const event1 = makeEvent({
      kind: "INVENTORY_UPSERTED",
      aggregateId: invId,
      payload: { unitId },
      sourceVersion: BigInt(1),
    });
    const result = await withTx((tx) => HANDLERS.INVENTORY_UPSERTED(tx, event1));
    expect(result.outcome).toBe("stale_skipped");
  });
});

describe("HANDLERS.CACHE_INVALIDATE", () => {
  it("returns completed without error even when cacheInvalidationId is undefined", async () => {
    const event = makeEvent({
      kind: "CACHE_INVALIDATE",
      payload: {},
    });

    const result = await withTx((tx) => HANDLERS.CACHE_INVALIDATE(tx, event));
    expect(result.outcome).toBe("completed");
  });

  it("marks cache_invalidations row as consumed when id is provided", async () => {
    // Insert a cache_invalidation row
    const ciId = `ci-${Date.now()}`;
    const unitId = `unit-ci-${Date.now()}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });
    await fixture.query(
      `INSERT INTO cache_invalidations (id, unit_id, projection_epoch, unit_identity_epoch, reason, enqueued_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [ciId, unitId, 1, 1, "REPUBLISH"]
    );

    const event = makeEvent({
      kind: "CACHE_INVALIDATE",
      payload: { cacheInvalidationId: ciId },
    });

    await withTx((tx) => HANDLERS.CACHE_INVALIDATE(tx, event));

    const rows = await fixture.getCacheInvalidations();
    const ci = rows.find((r) => r.id === ciId);
    expect(ci!.consumedAt).not.toBeNull();
  });
});

describe("HANDLERS.UNIT_UPSERTED", () => {
  it("returns completed for a valid unit", async () => {
    const unitId = `unit-uu-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });

    const event = makeEvent({
      kind: "UNIT_UPSERTED",
      aggregateId: unitId,
    });

    const result = await withTx((tx) => HANDLERS.UNIT_UPSERTED(tx, event));
    expect(result.outcome).toBe("completed");
  });
});

describe("HANDLERS.IDENTITY_MUTATION", () => {
  it("inserts a cache_invalidations row and enqueues CACHE_INVALIDATE event", async () => {
    const unitId = `unit-idm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: `hash-${unitId}` });

    const event = makeEvent({
      kind: "IDENTITY_MUTATION",
      aggregateId: unitId,
      sourceVersion: BigInt(1),
      unitIdentityEpoch: 1,
    });

    const result = await withTx((tx) => HANDLERS.IDENTITY_MUTATION(tx, event));
    expect(result.outcome).toBe("completed");

    // Check cache_invalidations row was inserted
    const ciRows = await fixture.getCacheInvalidations();
    const ci = ciRows.find((r) => r.unitId === unitId && r.reason === "IDENTITY_MUTATION");
    expect(ci).toBeDefined();

    // Check CACHE_INVALIDATE outbox event was enqueued
    const outbox = await fixture.getOutboxEvents();
    const cacheEvent = outbox.find(
      (e) => e.kind === "CACHE_INVALIDATE" && (e.payload.unitId as string) === unitId
    );
    expect(cacheEvent).toBeDefined();
    expect(cacheEvent!.priority).toBe(10);
  });
});

describe("HANDLERS error branches", () => {
  it("INVENTORY_UPSERTED returns transient_error when DB throws", async () => {
    // Use a broken tx that throws
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $executeRawUnsafe: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
      listing_inventories: {
        upsert: () => Promise.reject(new Error("DB error")),
        findUnique: () => Promise.reject(new Error("DB error")),
      },
      inventory_search_projection: {
        upsert: () => Promise.reject(new Error("DB error")),
        findUnique: () => Promise.reject(new Error("DB error")),
        deleteMany: () => Promise.reject(new Error("DB error")),
      },
      unit_public_projection: {
        upsert: () => Promise.reject(new Error("DB error")),
        count: () => Promise.reject(new Error("DB error")),
        deleteMany: () => Promise.reject(new Error("DB error")),
      },
      outbox_events: {
        create: () => Promise.reject(new Error("DB error")),
      },
      cache_invalidations: {
        create: () => Promise.reject(new Error("DB error")),
      },
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({ kind: "INVENTORY_UPSERTED" });
    const result = await HANDLERS.INVENTORY_UPSERTED(badTx, event);
    expect(result.outcome).toBe("transient_error");
    if (result.outcome === "transient_error") {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("UNIT_UPSERTED returns transient_error when DB throws", async () => {
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
      unit_public_projection: {
        upsert: () => Promise.reject(new Error("DB error")),
        count: () => Promise.reject(new Error("DB error")),
      },
      inventory_search_projection: {
        upsert: () => Promise.reject(new Error("DB error")),
      },
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({ kind: "UNIT_UPSERTED" });
    const result = await HANDLERS.UNIT_UPSERTED(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });

  it("TOMBSTONE returns transient_error when DB throws", async () => {
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
      inventory_search_projection: {
        deleteMany: () => Promise.reject(new Error("DB error")),
        findMany: () => Promise.reject(new Error("DB error")),
      },
      unit_public_projection: {
        deleteMany: () => Promise.reject(new Error("DB error")),
      },
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({ kind: "TOMBSTONE", payload: { inventoryId: "inv-1" } });
    const result = await HANDLERS.TOMBSTONE(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });

  it("SUPPRESSION returns transient_error when DB throws", async () => {
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
      inventory_search_projection: {
        deleteMany: () => Promise.reject(new Error("DB error")),
        findMany: () => Promise.reject(new Error("DB error")),
      },
      unit_public_projection: {
        deleteMany: () => Promise.reject(new Error("DB error")),
      },
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({ kind: "SUPPRESSION", payload: { inventoryId: "inv-1" } });
    const result = await HANDLERS.SUPPRESSION(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });

  it("PAUSE returns transient_error when DB throws", async () => {
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
      inventory_search_projection: {
        deleteMany: () => Promise.reject(new Error("DB error")),
        findMany: () => Promise.reject(new Error("DB error")),
      },
      unit_public_projection: {
        deleteMany: () => Promise.reject(new Error("DB error")),
      },
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({ kind: "PAUSE", payload: { inventoryId: "inv-1" } });
    const result = await HANDLERS.PAUSE(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });

  it("CACHE_INVALIDATE returns transient_error when DB throws", async () => {
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({ kind: "CACHE_INVALIDATE", payload: { cacheInvalidationId: "ci-123" } });
    const result = await HANDLERS.CACHE_INVALIDATE(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });

  it("IDENTITY_MUTATION returns transient_error when DB throws", async () => {
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
      outbox_events: {
        create: () => Promise.reject(new Error("DB error")),
      },
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({ kind: "IDENTITY_MUTATION" });
    const result = await HANDLERS.IDENTITY_MUTATION(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });
});

describe("HANDLERS.TOMBSTONE / SUPPRESSION / PAUSE", () => {
  async function seedUnitWithIsp(unitId: string): Promise<string> {
    const canonHash = `hash-${unitId}`;
    await fixture.insertPhysicalUnit({ id: unitId, canonicalAddressHash: canonHash });
    const invId = `inv-${unitId}`;
    await fixture.insertInventorySearchProjection({
      id: invId,
      inventoryId: invId,
      unitId,
      publishStatus: "PUBLISHED",
    });
    return invId;
  }

  it("TOMBSTONE handler returns completed", async () => {
    const unitId = `unit-tb-${Date.now()}`;
    const invId = await seedUnitWithIsp(unitId);

    const event = makeEvent({
      kind: "TOMBSTONE",
      aggregateId: unitId,
      payload: { inventoryId: invId },
    });

    const result = await withTx((tx) => HANDLERS.TOMBSTONE(tx, event));
    expect(result.outcome).toBe("completed");
  });

  it("SUPPRESSION handler returns completed", async () => {
    const unitId = `unit-sup-${Date.now()}`;
    const invId = await seedUnitWithIsp(unitId);

    const event = makeEvent({
      kind: "SUPPRESSION",
      aggregateId: unitId,
      payload: { inventoryId: invId },
    });

    const result = await withTx((tx) => HANDLERS.SUPPRESSION(tx, event));
    expect(result.outcome).toBe("completed");
  });

  it("PAUSE handler returns completed", async () => {
    const unitId = `unit-pse-${Date.now()}`;
    const invId = await seedUnitWithIsp(unitId);

    const event = makeEvent({
      kind: "PAUSE",
      aggregateId: unitId,
      payload: { inventoryId: invId },
    });

    const result = await withTx((tx) => HANDLERS.PAUSE(tx, event));
    expect(result.outcome).toBe("completed");
  });
});
