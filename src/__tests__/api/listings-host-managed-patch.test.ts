jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/geocoding", () => ({
  geocodeAddress: jest.fn(),
}));

jest.mock("@/lib/listing-language-guard", () => ({
  checkListingLanguageCompliance: jest.fn().mockReturnValue({ allowed: true }),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/api-error-handler", () => ({
  captureApiError: jest
    .fn()
    .mockImplementation((_error: unknown, _context: unknown) => {
      const { NextResponse } = jest.requireMock("next/server");
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }),
}));

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

jest.mock("@/lib/env", () => ({
  features: {
    semanticSearch: false,
    get moderationWriteLocks() {
      return process.env.FEATURE_MODERATION_WRITE_LOCKS === "true";
    },
  },
}));

jest.mock("@/lib/embeddings/sync", () => ({
  syncListingEmbedding: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/listings/canonical-inventory", () => ({
  syncCanonicalListingInventory: jest.fn().mockResolvedValue({
    unitId: "unit-456",
    inventoryId: "listing-abc",
    publishStatus: "PENDING_PROJECTION",
    sourceVersion: BigInt(4),
  }),
}));

jest.mock("@/lib/listings/canonical-lifecycle", () => ({
  syncListingLifecycleProjectionInTx: jest.fn().mockResolvedValue({
    action: "synced",
  }),
  tombstoneCanonicalInventoryInTx: jest.fn().mockResolvedValue({
    action: "tombstoned",
  }),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  })),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (
      data: unknown,
      init?: { status?: number; headers?: Record<string, string> }
    ) => {
      const headers = new Map(Object.entries(init?.headers || {}));
      return {
        status: init?.status || 200,
        json: async () => data,
        headers,
      };
    },
  },
}));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

import { PATCH } from "@/app/api/listings/[id]/route";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";
import { syncCanonicalListingInventory } from "@/lib/listings/canonical-inventory";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { createClient } from "@supabase/supabase-js";

const ownerSession = {
  user: { id: "owner-123", email: "owner@example.com", isSuspended: false },
};

const listing = {
  id: "listing-abc",
  ownerId: "owner-123",
  title: "Test Listing",
  description: "A test listing",
  price: 1000,
  amenities: ["Wifi"],
  houseRules: [],
  householdLanguages: [],
  totalSlots: 2,
  availableSlots: 2,
  openSlots: 2,
  version: 3,
  status: "ACTIVE" as const,
  statusReason: null,
  moveInDate: new Date("2026-05-01T00:00:00.000Z"),
  availableUntil: new Date("2026-08-01T00:00:00.000Z"),
  minStayMonths: 1,
  images: [],
  location: {
    id: "loc-123",
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
  },
};

function validPatchPayload(overrides: Record<string, unknown> = {}) {
  return {
    expectedVersion: 3,
    title: "Updated Title",
    description: "Updated description",
    price: 1200,
    amenities: ["Wifi"],
    houseRules: [],
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
    leaseDuration: null,
    roomType: null,
    householdLanguages: [],
    genderPreference: null,
    householdGender: null,
    images: [],
    ...overrides,
  };
}

function lockedListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-abc",
    ownerId: "owner-123",
    version: 3,
    status: "ACTIVE",
    statusReason: null,
    normalizedAddress: "123 main st san francisco ca 94102",
    physicalUnitId: null,
    openSlots: 2,
    availableSlots: 2,
    totalSlots: 2,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: new Date("2026-08-01T00:00:00.000Z"),
    minStayMonths: 1,
    lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
    freshnessReminderSentAt: null,
    freshnessWarningSentAt: null,
    autoPausedAt: null,
    ...overrides,
  };
}

function mockTransaction({
  lockedRows = [lockedListing()],
  updateResult = { ...listing, title: "Updated Title" },
}: {
  lockedRows?: unknown[];
  updateResult?: unknown;
} = {}) {
  const queryRaw = jest.fn().mockResolvedValue(lockedRows);
  const update = jest.fn().mockResolvedValue(updateResult);
  const locationUpdate = jest.fn();
  const executeRaw = jest.fn();

  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
    callback({
      $queryRaw: queryRaw,
      listing: { update },
      location: { update: locationUpdate },
      $executeRaw: executeRaw,
    })
  );

  return { queryRaw, update, locationUpdate, executeRaw };
}

describe("PATCH /api/listings/[id] contact-first availability contract", () => {
  const originalModerationWriteLocks =
    process.env.FEATURE_MODERATION_WRITE_LOCKS;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FEATURE_MODERATION_WRITE_LOCKS;
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(listing);
    (syncCanonicalListingInventory as jest.Mock).mockResolvedValue({
      unitId: "unit-456",
      inventoryId: "listing-abc",
      publishStatus: "PENDING_PROJECTION",
      sourceVersion: BigInt(4),
    });
  });

  afterEach(() => {
    if (originalModerationWriteLocks === undefined) {
      delete process.env.FEATURE_MODERATION_WRITE_LOCKS;
    } else {
      process.env.FEATURE_MODERATION_WRITE_LOCKS = originalModerationWriteLocks;
    }
  });

  it("allows non-availability profile edits without mutating availability fields", async () => {
    const { update } = mockTransaction();

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(validPatchPayload()),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-abc" },
        data: expect.objectContaining({
          title: "Updated Title",
          version: 4,
        }),
      })
    );
    expect(update.mock.calls[0][0].data).not.toHaveProperty("totalSlots");
    expect(update.mock.calls[0][0].data).not.toHaveProperty("availableSlots");
    expect(update.mock.calls[0][0].data).not.toHaveProperty("openSlots");
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.any(Object),
      "listing-abc",
      "listing_updated"
    );
    expect(syncCanonicalListingInventory).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        listing: expect.objectContaining({ id: "listing-abc" }),
        address: {
          address: "123 Main St",
          city: "San Francisco",
          state: "CA",
          zip: "94102",
        },
        actor: { role: "host", id: "owner-123" },
      })
    );
  });

  it("allows host-managed availability edits through the availability contract", async () => {
    const { update } = mockTransaction();

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          openSlots: 1,
          totalSlots: 2,
          moveInDate: "2026-05-01",
          availableUntil: "2026-09-01",
          minStayMonths: 2,
          status: "ACTIVE",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-abc" },
        data: expect.objectContaining({
          openSlots: 1,
          availableSlots: 1,
          totalSlots: 2,
          minStayMonths: 2,
          status: "ACTIVE",
          version: 4,
        }),
      })
    );
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.any(Object),
      "listing-abc",
      "listing_updated"
    );
  });

  it("rejects overflow move-in dates before mutating availability", async () => {
    const { update } = mockTransaction();

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          openSlots: 1,
          totalSlots: 2,
          moveInDate: "2026-02-31",
          availableUntil: "2026-09-01",
          minStayMonths: 2,
          status: "ACTIVE",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Validation failed",
      fields: { moveInDate: ["Invalid calendar date"] },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects overflow available-until dates before mutating availability", async () => {
    const { update } = mockTransaction();

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          openSlots: 1,
          totalSlots: 2,
          moveInDate: "2026-05-01",
          availableUntil: "2026-09-31",
          minStayMonths: 2,
          status: "ACTIVE",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Validation failed",
      fields: { availableUntil: ["Invalid calendar date"] },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns VERSION_CONFLICT when the expected version is stale", async () => {
    const { update } = mockTransaction();

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 2,
          openSlots: 1,
          totalSlots: 2,
          moveInDate: "2026-05-01",
          availableUntil: "2026-09-01",
          minStayMonths: 2,
          status: "ACTIVE",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("returns the moderation lock response before applying generic edits", async () => {
    process.env.FEATURE_MODERATION_WRITE_LOCKS = "true";
    const { update } = mockTransaction({
      lockedRows: [lockedListing({ statusReason: "ADMIN_PAUSED" })],
    });

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(validPatchPayload()),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      code: "LISTING_LOCKED",
      lockReason: "ADMIN_PAUSED",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("always blocks suppressed generic edits before version checks and image cleanup", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ...listing,
      images: [
        "https://test.supabase.co/storage/v1/object/public/images/listings/original.jpg",
      ],
    });
    const { update } = mockTransaction({
      lockedRows: [
        lockedListing({
          status: "PAUSED",
          statusReason: "SUPPRESSED",
          version: 9,
        }),
      ],
    });

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(
          validPatchPayload({
            expectedVersion: 3,
            images: [],
          })
        ),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      code: "LISTING_LOCKED",
      lockReason: "SUPPRESSED",
    });
    expect(update).not.toHaveBeenCalled();
    expect(markListingDirtyInTx).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks admin-paused generic edits even when locks are disabled", async () => {
    const { update } = mockTransaction({
      lockedRows: [lockedListing({ statusReason: "ADMIN_PAUSED" })],
    });

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(validPatchPayload()),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      code: "LISTING_LOCKED",
      lockReason: "ADMIN_PAUSED",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("always blocks suppressed availability edits before version checks", async () => {
    const { update } = mockTransaction({
      lockedRows: [
        lockedListing({
          status: "PAUSED",
          statusReason: "SUPPRESSED",
          version: 9,
        }),
      ],
    });

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          openSlots: 1,
          totalSlots: 2,
          moveInDate: "2026-05-01",
          availableUntil: "2026-09-01",
          minStayMonths: 2,
          status: "ACTIVE",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      code: "LISTING_LOCKED",
      lockReason: "SUPPRESSED",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes normalized address and physical unit linkage on address edits", async () => {
    (geocodeAddress as jest.Mock).mockResolvedValue({
      status: "ok",
      lat: 37.781,
      lng: -122.412,
    });
    const { update, locationUpdate, executeRaw } = mockTransaction({
      lockedRows: [
        lockedListing({
          normalizedAddress: "123 main st san francisco ca 94102",
          physicalUnitId: "unit-123",
        }),
      ],
    });

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(
          validPatchPayload({
            address: "456 Oak Ave",
            city: "San Francisco",
            state: "CA",
            zip: "94103",
          })
        ),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(200);
    expect(syncCanonicalListingInventory).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        address: {
          address: "456 Oak Ave",
          city: "San Francisco",
          state: "CA",
          zip: "94103",
        },
        actor: { role: "host", id: "owner-123" },
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-abc" },
        data: expect.objectContaining({
          normalizedAddress: "456 oak ave san francisco ca 94103",
          version: 4,
        }),
      })
    );
    expect(locationUpdate).toHaveBeenCalledWith({
      where: { id: "loc-123" },
      data: {
        address: "456 Oak Ave",
        city: "San Francisco",
        state: "CA",
        zip: "94103",
      },
    });
    expect(executeRaw).toHaveBeenCalled();
    expect(markListingDirtyInTx).toHaveBeenCalledWith(
      expect.any(Object),
      "listing-abc",
      "listing_updated"
    );
  });

  it("repairs canonical unit linkage when no physical unit exists", async () => {
    (geocodeAddress as jest.Mock).mockResolvedValue({
      status: "ok",
      lat: 37.781,
      lng: -122.412,
    });
    const { update } = mockTransaction({
      lockedRows: [
        lockedListing({
          normalizedAddress: "123 main st san francisco ca 94102",
          physicalUnitId: null,
        }),
      ],
    });

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(
          validPatchPayload({
            address: "456 Oak Ave",
            city: "San Francisco",
            state: "CA",
            zip: "94103",
          })
        ),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(200);
    expect(syncCanonicalListingInventory).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        address: {
          address: "456 Oak Ave",
          city: "San Francisco",
          state: "CA",
          zip: "94103",
        },
        actor: { role: "host", id: "owner-123" },
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-abc" },
        data: expect.objectContaining({
          normalizedAddress: "456 oak ave san francisco ca 94103",
          version: 4,
        }),
      })
    );
    expect(update.mock.calls[0][0].data).not.toHaveProperty("physicalUnitId");
  });
});
