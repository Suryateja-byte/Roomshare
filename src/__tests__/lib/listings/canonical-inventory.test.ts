jest.mock("@/lib/db/with-actor", () => ({
  setActorContext: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/identity/resolve-or-create-unit", () => ({
  resolveOrCreateUnit: jest.fn(),
}));

jest.mock("@/lib/outbox/append", () => ({
  appendOutboxEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/projections/tombstone", () => ({
  handleTombstone: jest.fn().mockResolvedValue({
    deletedInventoryRows: 0,
    unitRowDeleted: false,
    cacheInvalidationId: "cache-1",
    deletedSemanticRows: 0,
    skippedStale: false,
  }),
}));

jest.mock("@/lib/projections/inventory-projection", () => ({
  rebuildInventorySearchProjection: jest.fn().mockResolvedValue({
    updated: true,
    skippedStale: false,
    targetStatus: "PUBLISHED",
  }),
}));

jest.mock("@/lib/projections/unit-projection", () => ({
  rebuildUnitPublicProjection: jest.fn().mockResolvedValue({
    upserted: true,
    deleted: false,
    matchingInventoryCount: 1,
    sourceVersion: BigInt(1),
  }),
}));

import {
  resolveCanonicalPublishStatus,
  syncCanonicalListingInventory,
} from "@/lib/listings/canonical-inventory";
import { resolveOrCreateUnit } from "@/lib/identity/resolve-or-create-unit";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { handleTombstone } from "@/lib/projections/tombstone";
import { rebuildInventorySearchProjection } from "@/lib/projections/inventory-projection";
import { rebuildUnitPublicProjection } from "@/lib/projections/unit-projection";

const mockResolveOrCreateUnit = resolveOrCreateUnit as jest.Mock;
const mockAppendOutboxEvent = appendOutboxEvent as jest.Mock;
const mockHandleTombstone = handleTombstone as jest.Mock;
const mockRebuildInventorySearchProjection =
  rebuildInventorySearchProjection as jest.Mock;
const mockRebuildUnitPublicProjection = rebuildUnitPublicProjection as jest.Mock;

describe("resolveCanonicalPublishStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveOrCreateUnit.mockResolvedValue({
      unitId: "unit-1",
      unitIdentityEpoch: 1,
      geocodeStatus: "COMPLETE",
      canonicalizerVersion: "v1",
      canonicalAddressHash: "hash-1",
    });
  });

  const visibleBase = {
    status: "ACTIVE",
    openSlots: 1,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    geocodeStatus: "COMPLETE",
  };

  it("publishes visible active listings with complete geocode", () => {
    expect(resolveCanonicalPublishStatus(visibleBase)).toBe(
      "PENDING_PROJECTION"
    );
  });

  it("does not publish active admin-paused listings", () => {
    expect(
      resolveCanonicalPublishStatus({
        ...visibleBase,
        statusReason: "ADMIN_PAUSED",
      })
    ).toBe("PAUSED");
  });

  it("does not publish active suppressed listings", () => {
    expect(
      resolveCanonicalPublishStatus({
        ...visibleBase,
        statusReason: "SUPPRESSED",
      })
    ).toBe("SUPPRESSED");
  });

  it("does not publish active migration-review listings", () => {
    expect(
      resolveCanonicalPublishStatus({
        ...visibleBase,
        statusReason: "MIGRATION_REVIEW",
      })
    ).toBe("PAUSED");
  });

  it("tombstones active suppressed listings even when move-in date is missing", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "listing-1",
            unit_id: "unit-1",
            unit_identity_epoch_written_at: 1,
            publish_status: "SUPPRESSED",
            source_version: 5,
          },
        ]),
      listing: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    await expect(
      syncCanonicalListingInventory(tx as never, {
        listing: {
          id: "listing-1",
          physicalUnitId: "unit-1",
          price: 1200,
          totalSlots: 1,
          openSlots: 1,
          moveInDate: null,
          status: "ACTIVE",
          statusReason: "SUPPRESSED",
          version: 5,
        },
        address: {
          address: "1 Main St",
          city: "San Francisco",
          state: "CA",
          zip: "94102",
        },
        actor: { role: "host", id: "user-1" },
      })
    ).resolves.toMatchObject({
      inventoryId: "listing-1",
      publishStatus: "SUPPRESSED",
    });
    expect(mockAppendOutboxEvent).not.toHaveBeenCalled();
    expect(mockHandleTombstone).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        unitId: "unit-1",
        inventoryId: "listing-1",
        reason: "SUPPRESSION",
      })
    );
  });

  it("passes trusted coordinates and synchronously publishes visible projection rows", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "listing-1",
            unit_id: "unit-1",
            unit_identity_epoch_written_at: 1,
            publish_status: "PENDING_PROJECTION",
            source_version: 7,
          },
        ]),
      listing: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    await expect(
      syncCanonicalListingInventory(tx as never, {
        listing: {
          id: "listing-1",
          physicalUnitId: null,
          price: 700,
          roomType: "Shared Room",
          totalSlots: 1,
          openSlots: 1,
          moveInDate: new Date("2026-05-31T00:00:00.000Z"),
          status: "ACTIVE",
          version: 7,
        },
        address: {
          address: "1121 Hidden Rdg",
          city: "Irving",
          state: "TX",
          zip: "75038",
        },
        actor: { role: "host", id: "user-1" },
        trustedCoordinates: { lat: 32.87742, lng: -96.96477 },
      })
    ).resolves.toMatchObject({
      inventoryId: "listing-1",
      publishStatus: "PENDING_PROJECTION",
    });

    expect(mockResolveOrCreateUnit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        trustedCoordinates: { lat: 32.87742, lng: -96.96477 },
      })
    );
    expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: "INVENTORY_UPSERTED",
        aggregateId: "listing-1",
        sourceVersion: BigInt(7),
      })
    );
    expect(mockRebuildInventorySearchProjection).toHaveBeenCalledWith(tx, {
      unitId: "unit-1",
      inventoryId: "listing-1",
      sourceVersion: BigInt(7),
      unitIdentityEpoch: 1,
    });
    expect(mockRebuildUnitPublicProjection).toHaveBeenCalledWith(
      tx,
      "unit-1",
      1
    );
    expect(mockHandleTombstone).not.toHaveBeenCalled();
  });
});

describe("syncCanonicalListingInventory gating (H2)", () => {
  const VISIBLE_INPUT = {
    listing: {
      id: "listing-1",
      physicalUnitId: "unit-1",
      price: 700,
      roomType: "Shared Room",
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "ACTIVE",
      version: 7,
    },
    address: {
      address: "1 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
    },
    actor: { role: "host", id: "user-1" } as const,
  };

  function makeVisibleTx() {
    return {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "listing-1",
            unit_id: "unit-1",
            unit_identity_epoch_written_at: 1,
            publish_status: "PENDING_PROJECTION",
            source_version: 7,
          },
        ]),
      listing: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FEATURE_PHASE01_CANONICAL_WRITES;
    delete process.env.KILL_SWITCH_DISABLE_NEW_PUBLICATION;
    mockResolveOrCreateUnit.mockResolvedValue({
      unitId: "unit-1",
      unitIdentityEpoch: 1,
      geocodeStatus: "COMPLETE",
      canonicalizerVersion: "v1",
      canonicalAddressHash: "hash-1",
    });
  });

  afterAll(() => {
    delete process.env.FEATURE_PHASE01_CANONICAL_WRITES;
    delete process.env.KILL_SWITCH_DISABLE_NEW_PUBLICATION;
  });

  it("skips all canonical writes when the phase01 emergency stop is pulled", async () => {
    process.env.FEATURE_PHASE01_CANONICAL_WRITES = "false";
    const untouchableTx = new Proxy(
      {},
      {
        get(_target, prop) {
          throw new Error(
            `tx.${String(prop)} accessed during phase01 skip — no DB work allowed`
          );
        },
      }
    );

    await expect(
      syncCanonicalListingInventory(untouchableTx as never, VISIBLE_INPUT)
    ).resolves.toEqual({ skipped: true, reason: "phase01_flag_off" });

    expect(mockResolveOrCreateUnit).not.toHaveBeenCalled();
    expect(mockAppendOutboxEvent).not.toHaveBeenCalled();
    expect(mockRebuildInventorySearchProjection).not.toHaveBeenCalled();
    expect(mockRebuildUnitPublicProjection).not.toHaveBeenCalled();
    expect(mockHandleTombstone).not.toHaveBeenCalled();
  });

  it("still appends the outbox event but skips inline rebuilds when disable_new_publication is on", async () => {
    process.env.KILL_SWITCH_DISABLE_NEW_PUBLICATION = "true";
    const tx = makeVisibleTx();

    await expect(
      syncCanonicalListingInventory(tx as never, VISIBLE_INPUT)
    ).resolves.toMatchObject({
      inventoryId: "listing-1",
      publishStatus: "PENDING_PROJECTION",
    });

    expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ kind: "INVENTORY_UPSERTED" })
    );
    expect(mockRebuildInventorySearchProjection).not.toHaveBeenCalled();
    expect(mockRebuildUnitPublicProjection).not.toHaveBeenCalled();
  });

  it("runs both inline rebuilds when the kill switch is off", async () => {
    const tx = makeVisibleTx();

    await syncCanonicalListingInventory(tx as never, VISIBLE_INPUT);

    expect(mockAppendOutboxEvent).toHaveBeenCalledTimes(1);
    expect(mockRebuildInventorySearchProjection).toHaveBeenCalledTimes(1);
    expect(mockRebuildUnitPublicProjection).toHaveBeenCalledTimes(1);
  });
});

describe("syncCanonicalListingInventory stale-write guard (H3)", () => {
  const STALE_INPUT = {
    listing: {
      id: "listing-1",
      physicalUnitId: "unit-1",
      price: 700,
      roomType: "Shared Room",
      totalSlots: 1,
      openSlots: 1,
      moveInDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "ACTIVE",
      version: 5,
    },
    address: {
      address: "1 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
    },
    actor: { role: "host", id: "user-1" } as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FEATURE_PHASE01_CANONICAL_WRITES;
    delete process.env.KILL_SWITCH_DISABLE_NEW_PUBLICATION;
    mockResolveOrCreateUnit.mockResolvedValue({
      unitId: "unit-1",
      unitIdentityEpoch: 1,
      geocodeStatus: "COMPLETE",
      canonicalizerVersion: "v1",
      canonicalAddressHash: "hash-1",
    });
  });

  it("skips all fan-out when the upsert is rejected as stale (moderator pause won the race)", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        // previous-row read: a moderator already wrote a newer version
        .mockResolvedValueOnce([
          {
            unit_id: "unit-1",
            unit_identity_epoch_written_at: 1,
            source_version: 9,
          },
        ])
        // guarded upsert rejects: empty RETURNING
        .mockResolvedValueOnce([])
        // current-state re-read for the skip result
        .mockResolvedValueOnce([
          { publish_status: "PAUSED", source_version: 9 },
        ]),
      listing: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    await expect(
      syncCanonicalListingInventory(tx as never, STALE_INPUT)
    ).resolves.toEqual({
      skipped: true,
      reason: "stale_source_version",
      inventoryId: "listing-1",
      currentPublishStatus: "PAUSED",
      currentSourceVersion: BigInt(9),
    });

    expect(mockAppendOutboxEvent).not.toHaveBeenCalled();
    expect(mockHandleTombstone).not.toHaveBeenCalled();
    expect(mockRebuildInventorySearchProjection).not.toHaveBeenCalled();
    expect(mockRebuildUnitPublicProjection).not.toHaveBeenCalled();
  });

  it("applies an equal-version retry exactly as before (idempotent)", async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          {
            unit_id: "unit-1",
            unit_identity_epoch_written_at: 1,
            source_version: 5,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "listing-1",
            unit_id: "unit-1",
            unit_identity_epoch_written_at: 1,
            publish_status: "PENDING_PROJECTION",
            source_version: 5,
          },
        ]),
      listing: {
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    await expect(
      syncCanonicalListingInventory(tx as never, STALE_INPUT)
    ).resolves.toMatchObject({
      inventoryId: "listing-1",
      publishStatus: "PENDING_PROJECTION",
      sourceVersion: BigInt(5),
    });

    expect(mockAppendOutboxEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        kind: "INVENTORY_UPSERTED",
        aggregateId: "listing-1",
        sourceVersion: BigInt(5),
      })
    );
    expect(mockRebuildInventorySearchProjection).toHaveBeenCalledTimes(1);
    expect(mockRebuildUnitPublicProjection).toHaveBeenCalledTimes(1);
  });
});
