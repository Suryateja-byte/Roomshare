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

import {
  resolveCanonicalPublishStatus,
  syncCanonicalListingInventory,
} from "@/lib/listings/canonical-inventory";
import { resolveOrCreateUnit } from "@/lib/identity/resolve-or-create-unit";
import { appendOutboxEvent } from "@/lib/outbox/append";
import { handleTombstone } from "@/lib/projections/tombstone";

const mockResolveOrCreateUnit = resolveOrCreateUnit as jest.Mock;
const mockAppendOutboxEvent = appendOutboxEvent as jest.Mock;
const mockHandleTombstone = handleTombstone as jest.Mock;

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
});
