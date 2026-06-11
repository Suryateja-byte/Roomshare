/**
 * @jest-environment node
 *
 * H3 stale-write guard tests for syncCanonicalListingInventory.
 * Uses the PGlite Phase 02 fixture to exercise the real
 * `ON CONFLICT ... DO UPDATE ... WHERE EXCLUDED.source_version >= current`
 * SQL — the mock-based suite (canonical-inventory.test.ts) cannot.
 */

jest.mock("@/lib/identity/resolve-or-create-unit", () => ({
  resolveOrCreateUnit: jest.fn(),
}));

import {
  createPGlitePhase02Fixture,
  type Phase02Fixture,
} from "@/__tests__/utils/pglite-phase02";
import { syncCanonicalListingInventory } from "@/lib/listings/canonical-inventory";
import { resolveOrCreateUnit } from "@/lib/identity/resolve-or-create-unit";
import { __setProjectionEpochForTesting } from "@/lib/projections/epoch";
import type { TransactionClient } from "@/lib/db/with-actor";

const mockResolveOrCreateUnit = resolveOrCreateUnit as jest.Mock;

let fixture: Phase02Fixture;
const originalPhase03ProjectionWrites =
  process.env.FEATURE_PHASE03_SEMANTIC_PROJECTION_WRITES;

beforeAll(async () => {
  delete process.env.FEATURE_PHASE01_CANONICAL_WRITES;
  delete process.env.KILL_SWITCH_DISABLE_NEW_PUBLICATION;
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
  jest.clearAllMocks();
});

async function withTx<T>(
  fn: (tx: TransactionClient) => Promise<T>
): Promise<T> {
  return fixture.client.$transaction((tx) =>
    fn(tx as unknown as TransactionClient)
  );
}

/** Seed a unit + inventory row hidden by a moderator at the given version. */
async function seedHiddenInventory(opts: {
  publishStatus: string;
  sourceVersion: number;
}): Promise<{ unitId: string; listingId: string; canonHash: string }> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const unitId = `unit-cg-${suffix}`;
  const listingId = `listing-cg-${suffix}`;
  const canonHash = `hash-${unitId}`;

  await fixture.insertPhysicalUnit({
    id: unitId,
    canonicalAddressHash: canonHash,
  });
  await fixture.insertListingInventory({
    id: listingId,
    unitId,
    canonicalAddressHash: canonHash,
    roomCategory: "PRIVATE_ROOM",
    capacityGuests: 2,
  });
  await fixture.query(
    `UPDATE listing_inventories SET publish_status = $1, source_version = $2 WHERE id = $3`,
    [opts.publishStatus, opts.sourceVersion, listingId]
  );

  mockResolveOrCreateUnit.mockResolvedValue({
    unitId,
    unitIdentityEpoch: 1,
    geocodeStatus: "COMPLETE",
    canonicalizerVersion: "v1",
    canonicalAddressHash: canonHash,
  });

  return { unitId, listingId, canonHash };
}

function makeListingInput(opts: {
  listingId: string;
  unitId: string;
  version: number;
}) {
  return {
    listing: {
      id: opts.listingId,
      physicalUnitId: opts.unitId,
      price: 700,
      roomType: "Private Room",
      totalSlots: 2,
      openSlots: 1,
      moveInDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "ACTIVE",
      version: opts.version,
    },
    address: {
      address: "1 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
    },
    actor: { role: "host", id: "user-1" } as const,
  };
}

describe("syncCanonicalListingInventory source-version guard (H3, real SQL)", () => {
  it("is a no-op when a moderator pause holds a newer source_version", async () => {
    const { unitId, listingId } = await seedHiddenInventory({
      publishStatus: "PAUSED",
      sourceVersion: 9,
    });

    const result = await withTx((tx) =>
      syncCanonicalListingInventory(
        tx,
        makeListingInput({ listingId, unitId, version: 5 })
      )
    );

    expect(result).toMatchObject({
      skipped: true,
      reason: "stale_source_version",
      inventoryId: listingId,
      currentPublishStatus: "PAUSED",
      currentSourceVersion: BigInt(9),
    });

    // Row untouched: still hidden at the moderator's version
    const rows = await fixture.query(
      `SELECT publish_status, source_version FROM listing_inventories WHERE id = $1`,
      [listingId]
    );
    expect(rows[0].publish_status).toBe("PAUSED");
    expect(Number(rows[0].source_version)).toBe(9);

    // No publication fan-out
    const outbox = await fixture.getOutboxEvents();
    expect(
      outbox.find(
        (e) => e.kind === "INVENTORY_UPSERTED" && e.aggregateId === listingId
      )
    ).toBeUndefined();
  });

  it("applies an equal-version sync (idempotent retry) and publishes", async () => {
    const { unitId, listingId } = await seedHiddenInventory({
      publishStatus: "PAUSED",
      sourceVersion: 5,
    });

    const result = await withTx((tx) =>
      syncCanonicalListingInventory(
        tx,
        makeListingInput({ listingId, unitId, version: 5 })
      )
    );

    expect(result).toMatchObject({
      inventoryId: listingId,
      publishStatus: "PENDING_PROJECTION",
      sourceVersion: BigInt(5),
    });

    // The inline rebuild promoted the row through the normal pipeline
    const rows = await fixture.query(
      `SELECT publish_status FROM listing_inventories WHERE id = $1`,
      [listingId]
    );
    expect(rows[0].publish_status).toBe("PUBLISHED");

    const outbox = await fixture.getOutboxEvents();
    expect(
      outbox.find(
        (e) => e.kind === "INVENTORY_UPSERTED" && e.aggregateId === listingId
      )
    ).toBeDefined();
  });
});
