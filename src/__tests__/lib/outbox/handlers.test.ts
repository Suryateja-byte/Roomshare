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

jest.mock("@/lib/projections/geocode-worker", () => ({
  handleGeocodeNeeded: jest.fn(),
}));

jest.mock("@/lib/projections/semantic", () => ({
  ...jest.requireActual("@/lib/projections/semantic"),
  rebuildSemanticInventoryProjection: jest.fn(),
}));

jest.mock("@/lib/payments/webhook-worker", () => {
  class PaymentWebhookRetryableError extends Error {
    retryAfterMs: number;

    constructor(message = "Payment webhook retryable", retryAfterMs = 45_000) {
      super(message);
      this.retryAfterMs = retryAfterMs;
    }
  }

  return {
    PaymentWebhookRetryableError,
    processCapturedStripeEvent: jest.fn(),
  };
});

jest.mock("@/lib/search-alerts", () => ({
  deliverQueuedSearchAlert: jest.fn(),
  processSearchAlerts: jest.fn(),
}));

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { HANDLERS, type OutboxRow } from "@/lib/outbox/handlers";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";
import type { TransactionClient } from "@/lib/db/with-actor";
import { handleGeocodeNeeded } from "@/lib/projections/geocode-worker";
import {
  EmbeddingBudgetExceededError,
  rebuildSemanticInventoryProjection,
} from "@/lib/projections/semantic";
import {
  PaymentWebhookRetryableError,
  processCapturedStripeEvent,
} from "@/lib/payments/webhook-worker";
import {
  deliverQueuedSearchAlert,
  processSearchAlerts,
} from "@/lib/search-alerts";

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
  delete process.env.KILL_SWITCH_PAUSE_EMBED_PUBLISH;
  delete process.env.KILL_SWITCH_PAUSE_GEOCODE_PUBLISH;
  delete process.env.KILL_SWITCH_PAUSE_IDENTITY_RECONCILE;
});

async function withTx<T>(
  fn: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  return fixture.client.$transaction((tx) =>
    fn(tx as unknown as TransactionClient)
  );
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
  await fixture.insertPhysicalUnit({
    id: unitId,
    canonicalAddressHash: canonHash,
  });
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
      "PAYMENT_WEBHOOK",
      "ALERT_MATCH",
      "ALERT_DELIVER",
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
    expect(ispRows.find((row) => row.inventoryId === invId)?.unitId).toBe(
      unitId
    );

    const ciRows = await fixture.getCacheInvalidations();
    expect(
      ciRows.find((row) => row.unitId === unitId && row.reason === "REPUBLISH")
    ).toBeDefined();
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
    const result = await withTx((tx) =>
      HANDLERS.INVENTORY_UPSERTED(tx, event1)
    );
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
    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });
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
    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: `hash-${unitId}`,
    });

    const event = makeEvent({
      kind: "UNIT_UPSERTED",
      aggregateId: unitId,
    });

    const result = await withTx((tx) => HANDLERS.UNIT_UPSERTED(tx, event));
    expect(result.outcome).toBe("completed");
  });
});

describe("HANDLERS.IDENTITY_MUTATION", () => {
  it("fatal-errors mutation events that do not name affected units", async () => {
    const event = makeEvent({
      kind: "IDENTITY_MUTATION",
      aggregateType: "IDENTITY_MUTATION",
      aggregateId: "mutation-missing-units",
      payload: {},
    });

    const result = await withTx((tx) => HANDLERS.IDENTITY_MUTATION(tx, event));
    expect(result).toMatchObject({
      outcome: "fatal_error",
      dlqReason: "IDENTITY_MUTATION_NO_AFFECTED_UNITS",
    });
  });

  it("fans out cache invalidations to every affected unit from the mutation payload", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fromUnitId = `unit-idm-from-${suffix}`;
    const toUnitId = `unit-idm-to-${suffix}`;
    await fixture.insertPhysicalUnit({
      id: fromUnitId,
      canonicalAddressHash: `hash-${fromUnitId}`,
    });
    await fixture.insertPhysicalUnit({
      id: toUnitId,
      canonicalAddressHash: `hash-${toUnitId}`,
    });

    const event = makeEvent({
      kind: "IDENTITY_MUTATION",
      aggregateType: "IDENTITY_MUTATION",
      aggregateId: `mutation-${suffix}`,
      payload: {
        fromUnitIds: [fromUnitId],
        toUnitIds: [toUnitId],
      },
      sourceVersion: BigInt(1),
      unitIdentityEpoch: 1,
    });

    const result = await withTx((tx) => HANDLERS.IDENTITY_MUTATION(tx, event));
    expect(result.outcome).toBe("completed");

    // Check cache_invalidations row was inserted
    const ciRows = await fixture.getCacheInvalidations();
    expect(
      ciRows.find(
        (r) => r.unitId === fromUnitId && r.reason === "IDENTITY_MUTATION"
      )
    ).toBeDefined();
    expect(
      ciRows.find(
        (r) => r.unitId === toUnitId && r.reason === "IDENTITY_MUTATION"
      )
    ).toBeDefined();

    // Check CACHE_INVALIDATE outbox event was enqueued
    const outbox = await fixture.getOutboxEvents();
    const cacheEvents = outbox.filter((e) => e.kind === "CACHE_INVALIDATE");
    expect(
      cacheEvents.find((e) => (e.payload.unitId as string) === fromUnitId)
    ).toBeDefined();
    expect(
      cacheEvents.find((e) => (e.payload.unitId as string) === toUnitId)
    ).toBeDefined();
    expect(cacheEvents.every((event) => event.priority === 10)).toBe(true);
  });

  it("requeues identity mutations while identity reconciliation is paused", async () => {
    process.env.KILL_SWITCH_PAUSE_IDENTITY_RECONCILE = "true";
    const before = await fixture.getCacheInvalidations();

    const result = await withTx((tx) =>
      HANDLERS.IDENTITY_MUTATION(
        tx,
        makeEvent({
          kind: "IDENTITY_MUTATION",
          aggregateType: "IDENTITY_MUTATION",
          aggregateId: "mutation-paused",
          payload: {
            fromUnitIds: ["unit-paused-from"],
            toUnitIds: ["unit-paused-to"],
          },
        })
      )
    );

    expect(result).toEqual({
      outcome: "transient_error",
      retryAfterMs: 60_000,
      lastError: "Identity reconciliation paused",
    });
    await expect(fixture.getCacheInvalidations()).resolves.toHaveLength(
      before.length
    );
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

    const event = makeEvent({
      kind: "TOMBSTONE",
      payload: { inventoryId: "inv-1" },
    });
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

    const event = makeEvent({
      kind: "SUPPRESSION",
      payload: { inventoryId: "inv-1" },
    });
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

    const event = makeEvent({
      kind: "PAUSE",
      payload: { inventoryId: "inv-1" },
    });
    const result = await HANDLERS.PAUSE(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });

  it("CACHE_INVALIDATE returns transient_error when DB throws", async () => {
    const badTx = {
      $executeRaw: () => Promise.reject(new Error("DB error")),
      $queryRaw: () => Promise.reject(new Error("DB error")),
    } as unknown as import("@/lib/db/with-actor").TransactionClient;

    const event = makeEvent({
      kind: "CACHE_INVALIDATE",
      payload: { cacheInvalidationId: "ci-123" },
    });
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

    const event = makeEvent({
      kind: "IDENTITY_MUTATION",
      aggregateType: "IDENTITY_MUTATION",
      aggregateId: "mutation-db-error",
      payload: {
        fromUnitIds: ["unit-db-error-from"],
        toUnitIds: ["unit-db-error-to"],
      },
    });
    const result = await HANDLERS.IDENTITY_MUTATION(badTx, event);
    expect(result.outcome).toBe("transient_error");
  });
});

describe("HANDLERS.TOMBSTONE / SUPPRESSION / PAUSE", () => {
  async function seedUnitWithIsp(unitId: string): Promise<string> {
    const canonHash = `hash-${unitId}`;
    await fixture.insertPhysicalUnit({
      id: unitId,
      canonicalAddressHash: canonHash,
    });
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

describe("HANDLERS Phase 03+ async integrations", () => {
  const tx = {} as TransactionClient;
  const mockHandleGeocodeNeeded = handleGeocodeNeeded as jest.MockedFunction<
    typeof handleGeocodeNeeded
  >;
  const mockRebuildSemanticInventoryProjection =
    rebuildSemanticInventoryProjection as jest.MockedFunction<
      typeof rebuildSemanticInventoryProjection
    >;
  const mockProcessCapturedStripeEvent =
    processCapturedStripeEvent as jest.MockedFunction<
      typeof processCapturedStripeEvent
    >;
  const mockProcessSearchAlerts = processSearchAlerts as jest.MockedFunction<
    typeof processSearchAlerts
  >;
  const mockDeliverQueuedSearchAlert =
    deliverQueuedSearchAlert as jest.MockedFunction<
      typeof deliverQueuedSearchAlert
    >;

  it.each([
    ["success", { status: "success" }, "completed"],
    ["not_found", { status: "not_found" }, "completed"],
    [
      "transient_error",
      { status: "transient_error", retryAfterMs: 12_345 },
      "transient_error",
    ],
    [
      "exhausted",
      { status: "exhausted", dlqReason: "NO_GEOCODE" },
      "fatal_error",
    ],
  ] as const)(
    "maps GEOCODE_NEEDED %s outcome",
    async (_status, geocodeOutcome, expectedOutcome) => {
      mockHandleGeocodeNeeded.mockResolvedValueOnce(geocodeOutcome as never);

      const result = await HANDLERS.GEOCODE_NEEDED(
        tx,
        makeEvent({
          kind: "GEOCODE_NEEDED",
          aggregateType: "PHYSICAL_UNIT",
          aggregateId: "unit-geocode",
          payload: { address: "Austin, TX", requestId: "request-1" },
          attemptCount: 2,
        })
      );

      expect(result.outcome).toBe(expectedOutcome);
      expect(mockHandleGeocodeNeeded).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          aggregateType: "PHYSICAL_UNIT",
          aggregateId: "unit-geocode",
          payload: { address: "Austin, TX", requestId: "request-1" },
          attemptCount: 2,
        })
      );
      if (result.outcome === "transient_error") {
        expect(result.retryAfterMs).toBe(12_345);
      }
      if (result.outcome === "fatal_error") {
        expect(result.dlqReason).toBe("NO_GEOCODE");
      }
    }
  );

  it("requeues GEOCODE_NEEDED while geocode publishing is paused", async () => {
    process.env.KILL_SWITCH_PAUSE_GEOCODE_PUBLISH = "true";

    const result = await HANDLERS.GEOCODE_NEEDED(
      tx,
      makeEvent({
        kind: "GEOCODE_NEEDED",
        aggregateType: "PHYSICAL_UNIT",
        aggregateId: "unit-geocode-paused",
        payload: { address: "Austin, TX", requestId: "request-paused" },
      })
    );

    expect(result).toEqual({
      outcome: "transient_error",
      retryAfterMs: 60_000,
      lastError: "Geocode publication paused",
    });
    expect(mockHandleGeocodeNeeded).not.toHaveBeenCalled();
  });

  it("completes EMBED_NEEDED when semantic projection rebuild succeeds", async () => {
    mockRebuildSemanticInventoryProjection.mockResolvedValueOnce({
      skippedStale: false,
    } as never);

    const result = await HANDLERS.EMBED_NEEDED(
      tx,
      makeEvent({
        kind: "EMBED_NEEDED",
        aggregateId: "inventory-embed",
        payload: { unitId: "unit-embed" },
      })
    );

    expect(result).toEqual({ outcome: "completed" });
    expect(mockRebuildSemanticInventoryProjection).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        inventoryId: "inventory-embed",
        unitId: "unit-embed",
      })
    );
  });

  it("returns stale_skipped for stale EMBED_NEEDED rebuilds", async () => {
    mockRebuildSemanticInventoryProjection.mockResolvedValueOnce({
      skippedStale: true,
    } as never);

    const result = await HANDLERS.EMBED_NEEDED(
      tx,
      makeEvent({
        kind: "EMBED_NEEDED",
        aggregateId: "inventory-stale",
        payload: { unitId: "unit-stale" },
      })
    );

    expect(result).toEqual({ outcome: "stale_skipped" });
  });

  it("requeues EMBED_NEEDED while embed publishing is paused", async () => {
    process.env.KILL_SWITCH_PAUSE_EMBED_PUBLISH = "true";

    const result = await HANDLERS.EMBED_NEEDED(
      tx,
      makeEvent({
        kind: "EMBED_NEEDED",
        aggregateId: "inventory-paused",
        payload: { unitId: "unit-paused" },
      })
    );

    expect(result).toEqual({
      outcome: "transient_error",
      retryAfterMs: 60_000,
      lastError: "Embedding publication paused",
    });
    expect(mockRebuildSemanticInventoryProjection).not.toHaveBeenCalled();
  });

  it("uses provider retry timing when EMBED_NEEDED exhausts the embedding budget", async () => {
    mockRebuildSemanticInventoryProjection.mockRejectedValueOnce(
      new EmbeddingBudgetExceededError(98_765)
    );

    const result = await HANDLERS.EMBED_NEEDED(
      tx,
      makeEvent({
        kind: "EMBED_NEEDED",
        aggregateId: "inventory-budget",
        payload: { unitId: "unit-budget" },
      })
    );

    expect(result).toEqual({
      outcome: "transient_error",
      retryAfterMs: 98_765,
      lastError: "EMBEDDING_TOKEN_BUDGET_EXCEEDED",
    });
  });

  it("maps PAYMENT_WEBHOOK success and retryable failure", async () => {
    mockProcessCapturedStripeEvent.mockResolvedValueOnce(undefined);
    await expect(
      HANDLERS.PAYMENT_WEBHOOK(
        tx,
        makeEvent({ kind: "PAYMENT_WEBHOOK", aggregateId: "evt_1" })
      )
    ).resolves.toEqual({ outcome: "completed" });

    mockProcessCapturedStripeEvent.mockRejectedValueOnce(
      new PaymentWebhookRetryableError("stripe not ready", 22_000)
    );
    await expect(
      HANDLERS.PAYMENT_WEBHOOK(
        tx,
        makeEvent({ kind: "PAYMENT_WEBHOOK", aggregateId: "evt_2" })
      )
    ).resolves.toEqual({
      outcome: "transient_error",
      retryAfterMs: 22_000,
      lastError: "stripe not ready",
    });
  });

  it("maps ALERT_MATCH success and transient failure", async () => {
    mockProcessSearchAlerts.mockResolvedValueOnce({
      processed: 1,
      alertsSent: 0,
      errors: 0,
      details: [],
    });
    await expect(
      HANDLERS.ALERT_MATCH(tx, makeEvent({ kind: "ALERT_MATCH" }))
    ).resolves.toEqual({ outcome: "completed" });

    mockProcessSearchAlerts.mockRejectedValueOnce(new Error("alerts offline"));
    await expect(
      HANDLERS.ALERT_MATCH(tx, makeEvent({ kind: "ALERT_MATCH" }))
    ).resolves.toEqual({
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: "alerts offline",
    });
  });

  it("maps ALERT_DELIVER retry and completed statuses", async () => {
    mockDeliverQueuedSearchAlert.mockResolvedValueOnce({
      status: "retry",
      error: "mail throttled",
    } as never);

    await expect(
      HANDLERS.ALERT_DELIVER(
        tx,
        makeEvent({
          kind: "ALERT_DELIVER",
          aggregateId: "delivery-fallback",
          payload: {},
        })
      )
    ).resolves.toEqual({
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: "mail throttled",
    });
    expect(mockDeliverQueuedSearchAlert).toHaveBeenLastCalledWith(
      tx,
      "delivery-fallback"
    );

    mockDeliverQueuedSearchAlert.mockResolvedValueOnce({
      status: "delivered",
    } as never);
    await expect(
      HANDLERS.ALERT_DELIVER(
        tx,
        makeEvent({
          kind: "ALERT_DELIVER",
          aggregateId: "delivery-fallback",
          payload: { deliveryId: "delivery-explicit" },
        })
      )
    ).resolves.toEqual({ outcome: "completed" });
    expect(mockDeliverQueuedSearchAlert).toHaveBeenLastCalledWith(
      tx,
      "delivery-explicit"
    );
  });

  it("returns transient_error when ALERT_DELIVER throws", async () => {
    mockDeliverQueuedSearchAlert.mockRejectedValueOnce(
      new Error("delivery db down")
    );

    await expect(
      HANDLERS.ALERT_DELIVER(tx, makeEvent({ kind: "ALERT_DELIVER" }))
    ).resolves.toEqual({
      outcome: "transient_error",
      retryAfterMs: 30_000,
      lastError: "delivery db down",
    });
  });
});
