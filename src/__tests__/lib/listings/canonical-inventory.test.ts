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
