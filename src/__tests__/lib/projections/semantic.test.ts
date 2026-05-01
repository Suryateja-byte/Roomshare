/**
 * @jest-environment node
 *
 * Phase 03 semantic projection behavior.
 */

jest.mock("@sentry/nextjs", () => ({ addBreadcrumb: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { sync: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } },
}));

import {
  createPGlitePhase03Fixture,
  type Phase03Fixture,
} from "@/__tests__/utils/pglite-phase03";
import { HANDLERS, type OutboxRow } from "@/lib/outbox/handlers";
import { rebuildInventorySearchProjection } from "@/lib/projections/inventory-projection";
import { rebuildUnitPublicProjection } from "@/lib/projections/unit-projection";
import { handleTombstone } from "@/lib/projections/tombstone";
import {
  __resetEmbeddingTokenBudgetForTesting,
  buildSemanticProjectionText,
  EmbeddingBudgetExceededError,
  getSemanticInventoryCandidates,
  rebuildSemanticInventoryProjection,
  swapSemanticProjectionVersion,
  tombstoneSemanticProjectionRows,
} from "@/lib/projections/semantic";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";
import type { TransactionClient } from "@/lib/db/with-actor";

let fixture: Phase03Fixture;
const ORIGINAL_ENV = { ...process.env };

beforeAll(async () => {
  fixture = await createPGlitePhase03Fixture();
  __setProjectionEpochForTesting(BigInt(1));
}, 30_000);

afterAll(async () => {
  await fixture.close();
  __setProjectionEpochForTesting(null);
  process.env = ORIGINAL_ENV;
});

beforeEach(() => {
  jest.clearAllMocks();
  __resetEmbeddingTokenBudgetForTesting();
  process.env.FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES = "true";
  process.env.KILL_SWITCH_PAUSE_EMBED_PUBLISH = "false";
  process.env.KILL_SWITCH_ROLLBACK_EMBEDDING_VERSION = "";
});

afterEach(() => {
  __setProjectionEpochForTesting(BigInt(1));
});

async function withTx<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return fixture.client.$transaction((tx) => fn(tx as unknown as TransactionClient));
}

function makeEvent(overrides: Partial<OutboxRow> = {}): OutboxRow {
  return {
    id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    aggregateType: "LISTING_INVENTORY",
    aggregateId: `inv-${Date.now()}`,
    kind: "EMBED_NEEDED",
    payload: {},
    sourceVersion: BigInt(1),
    unitIdentityEpoch: 1,
    priority: 100,
    attemptCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

async function seedInventory(status = "PENDING_PROJECTION") {
  const unitId = `unit-sem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    [status, inventoryId]
  );
  return { unitId, inventoryId };
}

async function projectFilterRows(unitId: string, inventoryId: string, sourceVersion = BigInt(1)) {
  await withTx((tx) =>
    rebuildInventorySearchProjection(tx, {
      unitId,
      inventoryId,
      sourceVersion,
      unitIdentityEpoch: 1,
    })
  );
  await withTx((tx) => rebuildUnitPublicProjection(tx, unitId, 1));
}

async function getInventoryStatus(inventoryId: string): Promise<{
  publishStatus: string;
  lastEmbeddedVersion: string | null;
}> {
  const rows = await fixture.query<{
    publish_status: string;
    last_embedded_version: string | null;
  }>(
    `SELECT publish_status, last_embedded_version
     FROM listing_inventories
     WHERE id = $1`,
    [inventoryId]
  );
  return {
    publishStatus: rows[0].publish_status,
    lastEmbeddedVersion: rows[0].last_embedded_version,
  };
}

describe("Phase 03 semantic projection", () => {
  it("excludes sensitive housing attributes from semantic projection text", () => {
    const text = buildSemanticProjectionText({
      inventory_id: "inv-1",
      unit_id: "unit-1",
      unit_identity_epoch_written_at: 1,
      room_category: "PRIVATE_ROOM",
      capacity_guests: 2,
      total_beds: 3,
      open_beds: 1,
      price: "1200",
      available_from: "2026-05-01",
      available_until: null,
      lease_min_months: null,
      lease_max_months: null,
      lease_negotiable: false,
      gender_preference: "ANY",
      household_gender: "MIXED",
      public_cell_id: "cell-1",
      public_area_name: "Austin",
      projection_source_version: BigInt(1),
      matching_inventory_count: 2,
    });

    expect(text).not.toContain("Gender preference");
    expect(text).not.toContain("Household gender");
    expect(text).not.toContain("ANY");
    expect(text).not.toContain("MIXED");
  });

  it("moves filter-published inventory to PENDING_EMBEDDING and enqueues EMBED_NEEDED", async () => {
    const { unitId, inventoryId } = await seedInventory();

    await projectFilterRows(unitId, inventoryId);

    const inventory = await getInventoryStatus(inventoryId);
    expect(inventory.publishStatus).toBe("PENDING_EMBEDDING");

    const ispRows = await fixture.getInventorySearchProjections();
    expect(ispRows.find((row) => row.inventoryId === inventoryId)?.publishStatus).toBe("PUBLISHED");

    const outboxRows = await fixture.getOutboxEvents();
    expect(
      outboxRows.find(
        (row) =>
          row.kind === "EMBED_NEEDED" &&
          row.aggregateId === inventoryId &&
          row.payload.unitId === unitId
      )
    ).toBeDefined();
  });

  it("writes semantic projection and moves inventory to PUBLISHED", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await projectFilterRows(unitId, inventoryId);

    const result = await withTx((tx) =>
      rebuildSemanticInventoryProjection(
        tx,
        {
          unitId,
          inventoryId,
          sourceVersion: BigInt(1),
          unitIdentityEpoch: 1,
          embeddingVersion: "v-test",
        },
        { generateEmbedding: async () => [0.1, 0.2, 0.3] }
      )
    );

    expect(result.updated).toBe(true);
    expect(result.embeddingVersion).toBe("v-test");
    expect(result.sanitizedContentHash).toMatch(/^[a-f0-9]{64}$/);

    const semanticRows = await fixture.getSemanticInventoryProjections();
    const row = semanticRows.find((item) => item.inventoryId === inventoryId);
    expect(row?.publishStatus).toBe("PUBLISHED");
    expect(row?.embeddingVersion).toBe("v-test");

    const inventory = await getInventoryStatus(inventoryId);
    expect(inventory.publishStatus).toBe("PUBLISHED");
    expect(inventory.lastEmbeddedVersion).toBe("v-test");
  });

  it("passes the stored embedding version into the embedding provider", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await projectFilterRows(unitId, inventoryId);
    const generate = jest.fn(async () => [0.1, 0.2, 0.3]);

    await withTx((tx) =>
      rebuildSemanticInventoryProjection(
        tx,
        {
          unitId,
          inventoryId,
          sourceVersion: BigInt(1),
          unitIdentityEpoch: 1,
          embeddingVersion: "v-provider",
        },
        { generateEmbedding: generate }
      )
    );

    expect(generate).toHaveBeenCalledWith(
      expect.stringContaining("Room category:"),
      "RETRIEVAL_DOCUMENT",
      { embeddingVersion: "v-provider" }
    );

    const semanticRows = await fixture.getSemanticInventoryProjections();
    const row = semanticRows.find((item) => item.inventoryId === inventoryId);
    expect(row?.embeddingVersion).toBe("v-provider");
  });

  it("does not let stale source_version overwrite semantic projection", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await projectFilterRows(unitId, inventoryId, BigInt(5));

    await withTx((tx) =>
      rebuildSemanticInventoryProjection(
        tx,
        { unitId, inventoryId, sourceVersion: BigInt(5), unitIdentityEpoch: 1, embeddingVersion: "v-stale" },
        { generateEmbedding: async () => [0.1, 0.2, 0.3] }
      )
    );

    const stale = await withTx((tx) =>
      rebuildSemanticInventoryProjection(
        tx,
        { unitId, inventoryId, sourceVersion: BigInt(3), unitIdentityEpoch: 1, embeddingVersion: "v-stale" },
        { generateEmbedding: async () => [0.9, 0.9, 0.9] }
      )
    );

    expect(stale.skippedStale).toBe(true);
    const semanticRows = await fixture.getSemanticInventoryProjections();
    expect(semanticRows.find((row) => row.inventoryId === inventoryId)?.sourceVersion).toBe(BigInt(5));
  });

  it("skips stale EMBED_NEEDED when filter projection is already newer", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await projectFilterRows(unitId, inventoryId, BigInt(5));
    const generate = jest.fn(async () => [0.1, 0.2, 0.3]);

    const stale = await withTx((tx) =>
      rebuildSemanticInventoryProjection(
        tx,
        { unitId, inventoryId, sourceVersion: BigInt(3), unitIdentityEpoch: 1, embeddingVersion: "v-newer-filter" },
        { generateEmbedding: generate }
      )
    );

    expect(stale.skippedStale).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it("provider failure leaves inventory in PENDING_EMBEDDING", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await projectFilterRows(unitId, inventoryId);

    await expect(
      withTx((tx) =>
        rebuildSemanticInventoryProjection(
          tx,
          { unitId, inventoryId, sourceVersion: BigInt(1), unitIdentityEpoch: 1 },
          { generateEmbedding: async () => { throw new Error("provider down"); } }
        )
      )
    ).rejects.toThrow("provider down");

    expect((await getInventoryStatus(inventoryId)).publishStatus).toBe("PENDING_EMBEDDING");
  });

  it("pause_embed_publish requeues without deleting active semantic rows", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await fixture.insertSemanticInventoryProjection({
      inventoryId,
      unitId,
      embeddingVersion: "active-v1",
      publishStatus: "PUBLISHED",
    });
    process.env.KILL_SWITCH_PAUSE_EMBED_PUBLISH = "true";

    const result = await withTx((tx) =>
      HANDLERS.EMBED_NEEDED(
        tx,
        makeEvent({ aggregateId: inventoryId, payload: { unitId } })
      )
    );

    expect(result.outcome).toBe("transient_error");
    const semanticRows = await fixture.getSemanticInventoryProjections();
    expect(semanticRows.find((row) => row.embeddingVersion === "active-v1")).toBeDefined();
  });

  it("token budget exhaustion requeues before provider call", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await projectFilterRows(unitId, inventoryId);
    const generate = jest.fn(async () => [0.1, 0.2, 0.3]);

    await expect(
      withTx((tx) =>
        rebuildSemanticInventoryProjection(
          tx,
          { unitId, inventoryId, sourceVersion: BigInt(1), unitIdentityEpoch: 1 },
          { generateEmbedding: generate, tokenBudgetPerMinute: 1, nowMs: () => 1_000 }
        )
      )
    ).rejects.toBeInstanceOf(EmbeddingBudgetExceededError);

    expect(generate).not.toHaveBeenCalled();
  });

  it("dark candidate helper only returns PUBLISHED rows for the selected embedding version", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await fixture.insertSemanticInventoryProjection({
      inventoryId: `${inventoryId}-old`,
      unitId,
      embeddingVersion: "v-old",
      publishStatus: "PUBLISHED",
    });
    await fixture.insertSemanticInventoryProjection({
      inventoryId,
      unitId,
      embeddingVersion: "v-read",
      publishStatus: "PUBLISHED",
    });
    await fixture.insertSemanticInventoryProjection({
      inventoryId: `${inventoryId}-shadow`,
      unitId,
      embeddingVersion: "v-read",
      publishStatus: "SHADOW",
    });

    const rows = await withTx((tx) =>
      getSemanticInventoryCandidates(tx, { embeddingVersion: "v-read" })
    );

    expect(rows.map((row) => row.inventoryId)).toEqual([inventoryId]);
  });

  it("tombstone fan-out removes active and shadow semantic rows", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await fixture.insertSemanticInventoryProjection({
      inventoryId,
      unitId,
      embeddingVersion: "v-active",
      publishStatus: "PUBLISHED",
    });
    await fixture.insertSemanticInventoryProjection({
      inventoryId,
      unitId,
      embeddingVersion: "v-shadow",
      publishStatus: "SHADOW",
    });

    const result = await withTx((tx) =>
      handleTombstone(tx, {
        unitId,
        inventoryId,
        reason: "SUPPRESSION",
        unitIdentityEpoch: 1,
        sourceVersion: BigInt(1),
      })
    );

    expect(result.deletedSemanticRows).toBe(2);
    const remainingRows = await fixture.getSemanticInventoryProjections();
    expect(remainingRows.filter((row) => row.inventoryId === inventoryId)).toEqual([]);
  });

  it("does not tombstone newer semantic rows with stale source versions", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await fixture.insertSemanticInventoryProjection({
      inventoryId,
      unitId,
      embeddingVersion: "v-newer",
      publishStatus: "PUBLISHED",
      sourceVersion: BigInt(10),
    });

    const deleted = await withTx((tx) =>
      tombstoneSemanticProjectionRows(tx, {
        unitId,
        inventoryId,
        sourceVersion: BigInt(9),
      })
    );

    expect(deleted).toBe(0);
    const remainingRows = await fixture.getSemanticInventoryProjections();
    expect(
      remainingRows.find(
        (row) =>
          row.inventoryId === inventoryId && row.embeddingVersion === "v-newer"
      )
    ).toBeDefined();
  });

  it("shadow swap publishes target version and stales the prior version", async () => {
    const { unitId, inventoryId } = await seedInventory();
    await fixture.insertSemanticInventoryProjection({
      inventoryId,
      unitId,
      embeddingVersion: "v1",
      publishStatus: "PUBLISHED",
    });
    await fixture.insertSemanticInventoryProjection({
      inventoryId: `${inventoryId}-v2`,
      unitId,
      embeddingVersion: "v2",
      publishStatus: "SHADOW",
    });

    const result = await withTx((tx) =>
      swapSemanticProjectionVersion(tx, {
        targetEmbeddingVersion: "v2",
        previousEmbeddingVersion: "v1",
        minTargetRows: 1,
      })
    );

    expect(result).toEqual({ targetRows: 1, staleRows: 1, publishedRows: 1 });
    const rows = await fixture.getSemanticInventoryProjections();
    expect(rows.find((row) => row.embeddingVersion === "v1")?.publishStatus).toBe("STALE_PUBLISHED");
    expect(rows.find((row) => row.embeddingVersion === "v2")?.publishStatus).toBe("PUBLISHED");
  });
});
