jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    location: {
      update: jest.fn(),
    },
    booking: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
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

jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
  getFuturePeakReservedLoad: jest.fn().mockResolvedValue(0),
  syncFutureInventoryTotalSlots: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/app/actions/suspension", () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
  checkEmailVerified: jest.fn().mockResolvedValue({ verified: true }),
}));

jest.mock("@/lib/search/search-doc-dirty", () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
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
    wholeUnitMode: true,
    searchDoc: true,
  },
}));

jest.mock("@/lib/embeddings/sync", () => ({
  syncListingEmbedding: jest.fn().mockResolvedValue(undefined),
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
import {
  getAvailability,
  getFuturePeakReservedLoad,
  syncFutureInventoryTotalSlots,
} from "@/lib/availability";
import { markListingDirty } from "@/lib/search/search-doc-dirty";

const ownerSession = {
  user: { id: "owner-123", email: "owner@example.com", isSuspended: false },
};

function makeHostManagedListing() {
  return {
    id: "listing-abc",
    ownerId: "owner-123",
    availabilitySource: "HOST_MANAGED" as const,
    title: "Test Listing",
    description: "A test listing",
    price: 1000,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    totalSlots: 2,
    availableSlots: 2,
    openSlots: 2,
    version: 3,
    status: "PAUSED" as const,
    statusReason: "HOST_PAUSED",
    needsMigrationReview: false,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: new Date("2026-08-01T00:00:00.000Z"),
    minStayMonths: 1,
    bookingMode: "SHARED",
    images: [],
    location: {
      id: "loc-123",
      address: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
    },
  };
}

function makeLockedHostManagedListing(
  overrides: Partial<{
    ownerId: string;
    version: number;
    status: "ACTIVE" | "PAUSED" | "RENTED";
    statusReason: string | null;
    needsMigrationReview: boolean;
    openSlots: number | null;
    availableSlots: number;
    totalSlots: number;
    moveInDate: Date | null;
    availableUntil: Date | null;
    minStayMonths: number;
    bookingMode: string;
  }> = {}
) {
  return {
    id: "listing-abc",
    ownerId: "owner-123",
    version: 3,
    availabilitySource: "HOST_MANAGED" as const,
    status: "PAUSED" as const,
    statusReason: "HOST_PAUSED",
    needsMigrationReview: false,
    openSlots: 2,
    availableSlots: 2,
    totalSlots: 2,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: new Date("2026-08-01T00:00:00.000Z"),
    minStayMonths: 1,
    lastConfirmedAt: null,
    freshnessReminderSentAt: new Date("2026-04-01T00:00:00.000Z"),
    freshnessWarningSentAt: new Date("2026-04-08T00:00:00.000Z"),
    autoPausedAt: new Date("2026-04-10T00:00:00.000Z"),
    bookingMode: "SHARED",
    ...overrides,
  };
}

function makeTransaction(queryRawMock: jest.Mock, updateMock: jest.Mock) {
  return async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRaw: queryRawMock,
      listing: { update: updateMock },
      location: { update: jest.fn() },
      booking: { count: jest.fn() },
      $executeRaw: jest.fn(),
    });
}

describe("PATCH /api/listings/[id] host-managed contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (auth as jest.Mock).mockResolvedValue(ownerSession);
    (getAvailability as jest.Mock).mockResolvedValue(null);
    (getFuturePeakReservedLoad as jest.Mock).mockResolvedValue(0);
    (syncFutureInventoryTotalSlots as jest.Mock).mockResolvedValue(undefined);
  });

  it("uses prepareHostManagedListingWrite data for dedicated availability edits", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      makeHostManagedListing()
    );
    const queryRawMock = jest
      .fn()
      .mockResolvedValue([makeLockedHostManagedListing()]);
    const updateMock = jest.fn().mockResolvedValue({
      id: "listing-abc",
      version: 4,
      status: "ACTIVE",
      statusReason: null,
      openSlots: 1,
      availableSlots: 1,
      totalSlots: 2,
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      makeTransaction(queryRawMock, updateMock)
    );

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          openSlots: 1,
          totalSlots: 2,
          moveInDate: "2026-05-01",
          availableUntil: "2026-08-01",
          minStayMonths: 2,
          status: "ACTIVE",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-abc" },
        data: expect.objectContaining({
          version: 4,
          status: "ACTIVE",
          statusReason: null,
          openSlots: 1,
          availableSlots: 1,
          totalSlots: 2,
          minStayMonths: 2,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: new Date("2026-08-01T00:00:00.000Z"),
          freshnessReminderSentAt: null,
          freshnessWarningSentAt: null,
          autoPausedAt: null,
        }),
      })
    );
    expect(getAvailability).not.toHaveBeenCalled();
    expect(getFuturePeakReservedLoad).not.toHaveBeenCalled();
    expect(syncFutureInventoryTotalSlots).not.toHaveBeenCalled();
    expect(markListingDirty).toHaveBeenCalledWith(
      "listing-abc",
      "listing_updated"
    );
  });

  it("returns VERSION_CONFLICT for stale dedicated writes", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      makeHostManagedListing()
    );
    const queryRawMock = jest
      .fn()
      .mockResolvedValue([makeLockedHostManagedListing({ version: 4 })]);
    const updateMock = jest.fn();
    (prisma.$transaction as jest.Mock).mockImplementation(
      makeTransaction(queryRawMock, updateMock)
    );

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          openSlots: 1,
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This listing was updated elsewhere. Reload and try again.",
      code: "VERSION_CONFLICT",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects ACTIVE when dedicated openSlots is zero", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      makeHostManagedListing()
    );
    const queryRawMock = jest
      .fn()
      .mockResolvedValue([makeLockedHostManagedListing()]);
    const updateMock = jest.fn();
    (prisma.$transaction as jest.Mock).mockImplementation(
      makeTransaction(queryRawMock, updateMock)
    );

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          status: "ACTIVE",
          openSlots: 0,
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Active host-managed listings require at least one open slot.",
      code: "HOST_MANAGED_ACTIVE_REQUIRES_OPEN_SLOTS",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid dedicated availability date ranges", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      makeHostManagedListing()
    );
    const queryRawMock = jest
      .fn()
      .mockResolvedValue([makeLockedHostManagedListing()]);
    const updateMock = jest.fn();
    (prisma.$transaction as jest.Mock).mockImplementation(
      makeTransaction(queryRawMock, updateMock)
    );

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          moveInDate: "2026-08-02",
          availableUntil: "2026-08-01",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Host-managed listings require a valid availability window.",
      code: "HOST_MANAGED_INVALID_DATE_RANGE",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects activation while migration review is required", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      makeHostManagedListing()
    );
    const queryRawMock = jest.fn().mockResolvedValue([
      makeLockedHostManagedListing({ needsMigrationReview: true }),
    ]);
    const updateMock = jest.fn();
    (prisma.$transaction as jest.Mock).mockImplementation(
      makeTransaction(queryRawMock, updateMock)
    );

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          status: "ACTIVE",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error:
        "This listing must finish migration review before it can be made active.",
      code: "HOST_MANAGED_MIGRATION_REVIEW_REQUIRED",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("auto-closes omitted-status dedicated writes with openSlots=0", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      makeHostManagedListing()
    );
    const queryRawMock = jest
      .fn()
      .mockResolvedValue([makeLockedHostManagedListing()]);
    const updateMock = jest.fn().mockResolvedValue({
      id: "listing-abc",
      version: 4,
      status: "RENTED",
      statusReason: "NO_OPEN_SLOTS",
      openSlots: 0,
      availableSlots: 0,
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      makeTransaction(queryRawMock, updateMock)
    );

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: 3,
          openSlots: 0,
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 4,
          status: "RENTED",
          statusReason: "NO_OPEN_SLOTS",
          openSlots: 0,
          availableSlots: 0,
        }),
      })
    );
  });

  it("keeps metadata-only full-form edits working for HOST_MANAGED listings", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      makeHostManagedListing()
    );
    const queryRawMock = jest
      .fn()
      .mockResolvedValue([makeLockedHostManagedListing()]);
    const updateMock = jest
      .fn()
      .mockResolvedValue({ id: "listing-abc", title: "Updated Title" });
    (prisma.$transaction as jest.Mock).mockImplementation(
      makeTransaction(queryRawMock, updateMock)
    );

    const response = await PATCH(
      new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Updated Title",
          description: "Updated description",
          price: "1200",
          totalSlots: "2",
          address: "123 Main St",
          city: "San Francisco",
          state: "CA",
          zip: "94102",
          moveInDate: "2026-05-01T00:00:00.000Z",
          bookingMode: "SHARED",
        }),
      }),
      { params: Promise.resolve({ id: "listing-abc" }) }
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-abc" },
        data: expect.objectContaining({
          title: "Updated Title",
          totalSlots: 2,
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        }),
      })
    );
    expect(getAvailability).not.toHaveBeenCalled();
    expect(getFuturePeakReservedLoad).not.toHaveBeenCalled();
    expect(syncFutureInventoryTotalSlots).not.toHaveBeenCalled();
  });
});
