/**
 * Tests for IDOR protection on listings API (P0-02)
 *
 * Verifies that users cannot PATCH/DELETE listings they don't own.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    location: {
      update: jest.fn(),
      deleteMany: jest.fn(),
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
    report: {
      count: jest.fn(),
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
  markListingsDirty: jest.fn().mockResolvedValue(undefined),
  markListingDirtyInTx: jest.fn().mockResolvedValue(undefined),
  markListingsDirtyInTx: jest.fn().mockResolvedValue(undefined),
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

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("@/lib/request-context", () => ({
  getRequestId: jest.fn().mockReturnValue("test-request-id"),
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

jest.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
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

jest.mock("@/lib/listings/canonical-inventory", () => ({
  syncCanonicalListingInventory: jest
    .fn()
    .mockResolvedValue({ unitId: "unit-123" }),
}));

jest.mock("@/lib/listings/canonical-lifecycle", () => ({
  syncListingLifecycleProjectionInTx: jest.fn().mockResolvedValue({
    action: "synced",
  }),
  tombstoneListingInventoryInTx: jest.fn().mockResolvedValue({
    action: "tombstoned",
  }),
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

// Set env vars for Supabase
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

import { PATCH, DELETE } from "@/app/api/listings/[id]/route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { markListingDirtyInTx } from "@/lib/search/search-doc-dirty";
import { logger } from "@/lib/logger";
import {
  syncListingLifecycleProjectionInTx,
  tombstoneListingInventoryInTx,
} from "@/lib/listings/canonical-lifecycle";
import {
  getAvailability,
  getFuturePeakReservedLoad,
  syncFutureInventoryTotalSlots,
} from "@/lib/availability";

function makeAvailabilitySnapshot(
  overrides: Partial<{
    listingId: string;
    totalSlots: number;
    effectiveAvailableSlots: number;
    heldSlots: number;
    acceptedSlots: number;
    rangeVersion: number;
    asOf: string;
  }> = {}
) {
  return {
    listingId: "listing-abc",
    totalSlots: 2,
    effectiveAvailableSlots: 2,
    heldSlots: 0,
    acceptedSlots: 0,
    rangeVersion: 0,
    asOf: new Date("2026-04-14T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function makeLockedListing(
  overrides: Partial<{
    ownerId: string;
    totalSlots: number;
    availableSlots: number;
    bookingMode: string;
    availabilitySource: "LEGACY_BOOKING" | "HOST_MANAGED";
    moveInDate: Date | null;
    availableUntil: Date | null;
    minStayMonths: number;
  }> = {}
) {
  return {
    id: "listing-abc",
    ownerId: "owner-123",
    version: 3,
    status: "ACTIVE",
    statusReason: null,
    normalizedAddress: "123 main st san francisco ca 94102",
    physicalUnitId: null,
    openSlots: 2,
    totalSlots: 2,
    availableSlots: 2,
    bookingMode: "SHARED",
    availabilitySource: "LEGACY_BOOKING" as const,
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availableUntil: null as Date | null,
    minStayMonths: 1,
    ...overrides,
  };
}

describe("Listings API IDOR Protection", () => {
  const ownerSession = {
    user: { id: "owner-123", email: "owner@example.com", isSuspended: false },
    authTime: Math.floor(Date.now() / 1000),
  };

  const attackerSession = {
    user: {
      id: "attacker-456",
      email: "attacker@example.com",
      isSuspended: false,
    },
    authTime: Math.floor(Date.now() / 1000),
  };

  const mockListing = {
    id: "listing-abc",
    ownerId: "owner-123",
    title: "Test Listing",
    description: "A test listing",
    price: 1000,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    totalSlots: 2,
    availableSlots: 2,
    images: [],
    location: {
      id: "loc-123",
      address: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
    },
  };

  const validPatchPayload = {
    title: "Updated Title",
    description: "Updated description",
    price: "1200",
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
    expectedVersion: 3,
    leaseDuration: null,
    roomType: null,
    householdLanguages: [],
    genderPreference: null,
    householdGender: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ password: null });
    (getAvailability as jest.Mock).mockResolvedValue(makeAvailabilitySnapshot());
    (getFuturePeakReservedLoad as jest.Mock).mockResolvedValue(0);
    (syncFutureInventoryTotalSlots as jest.Mock).mockResolvedValue(undefined);
  });

  describe("PATCH /api/listings/[id]", () => {
    it("returns 404 when non-owner tries to update listing", async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          title: "Hacked Title",
          description: "Hacked description",
          price: "1",
          totalSlots: "1",
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Listing not found");

      // Verify update was NOT called
      expect(prisma.listing.update).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("allows owner to update their own listing", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      const queryRawMock = jest
        .fn()
        .mockResolvedValue([makeLockedListing()]);
      const updateMock = jest
        .fn()
        .mockResolvedValue({ ...mockListing, title: "Updated Title" });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            $queryRaw: queryRawMock,
            listing: { update: updateMock },
            location: { update: jest.fn() },
            $executeRaw: jest.fn(),
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(validPatchPayload),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(200);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(queryRawMock).toHaveBeenCalled();
      // Verify FOR UPDATE lock is used for ownership recheck
      const sqlStrings = queryRawMock.mock.calls[0][0].join("");
      expect(sqlStrings).toContain("FOR UPDATE");
      expect(updateMock).toHaveBeenCalled();
    });

    it("returns 409 for legacy inventory writes against HOST_MANAGED listings", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      const queryRawMock = jest.fn().mockResolvedValue([
        makeLockedListing({
          availabilitySource: "HOST_MANAGED",
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
        }),
      ]);
      const updateMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
          booking: { count: jest.fn() },
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          totalSlots: "3",
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error:
          "Availability is managed by the contact-first inventory editor. Reload and use the availability editor.",
        code: "HOST_MANAGED_WRITE_PATH_REQUIRED",
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("returns 409 when generic PATCH mutates availableUntil on a HOST_MANAGED listing", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      const queryRawMock = jest.fn().mockResolvedValue([
        makeLockedListing({
          availabilitySource: "HOST_MANAGED",
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: new Date("2026-08-01T00:00:00.000Z"),
          minStayMonths: 1,
        }),
      ]);
      const updateMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
          booking: { count: jest.fn() },
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          availableUntil: "2026-12-01",
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error:
          "Availability is managed by the contact-first inventory editor. Reload and use the availability editor.",
        code: "HOST_MANAGED_WRITE_PATH_REQUIRED",
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("returns 409 when generic PATCH mutates minStayMonths on a HOST_MANAGED listing", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      const queryRawMock = jest.fn().mockResolvedValue([
        makeLockedListing({
          availabilitySource: "HOST_MANAGED",
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: new Date("2026-08-01T00:00:00.000Z"),
          minStayMonths: 1,
        }),
      ]);
      const updateMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
          booking: { count: jest.fn() },
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          minStayMonths: 6,
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error:
          "Availability is managed by the contact-first inventory editor. Reload and use the availability editor.",
        code: "HOST_MANAGED_WRITE_PATH_REQUIRED",
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("blocks generic PATCH of availability-window fields after booking retirement", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      const queryRawMock = jest.fn().mockResolvedValue([
        makeLockedListing({
          availabilitySource: "LEGACY_BOOKING",
          moveInDate: new Date("2026-05-01T00:00:00.000Z"),
          availableUntil: new Date("2026-08-01T00:00:00.000Z"),
          minStayMonths: 1,
        }),
      ]);
      const updateMock = jest
        .fn()
        .mockResolvedValue({ ...mockListing, title: "Updated Title" });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
          booking: { count: jest.fn() },
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          availableUntil: "2026-12-01",
          minStayMonths: 6,
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({
        error:
          "Availability is managed by the contact-first inventory editor. Reload and use the availability editor.",
        code: "HOST_MANAGED_WRITE_PATH_REQUIRED",
      });
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("blocks generic PATCH of totalSlots instead of recalculating retired booking availability", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        totalSlots: 5,
        availableSlots: 5,
      });
      (getAvailability as jest.Mock).mockResolvedValue(
        makeAvailabilitySnapshot({
          totalSlots: 5,
          effectiveAvailableSlots: 4,
          acceptedSlots: 1,
          heldSlots: 0,
        })
      );

      const queryRawMock = jest
        .fn()
        .mockResolvedValue([makeLockedListing({ totalSlots: 5, availableSlots: 5 })]);
      const updateMock = jest
        .fn()
        .mockResolvedValue({ ...mockListing, totalSlots: 7, availableSlots: 6 });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({ ...validPatchPayload, totalSlots: "7" }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      expect(updateMock).not.toHaveBeenCalled();
      expect(syncFutureInventoryTotalSlots).not.toHaveBeenCalled();
    });

    it("does not revive stale low booking availability math after booking retirement", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        totalSlots: 5,
        availableSlots: 1,
      });
      (getAvailability as jest.Mock).mockResolvedValue(
        makeAvailabilitySnapshot({
          totalSlots: 5,
          effectiveAvailableSlots: 4,
          acceptedSlots: 1,
          heldSlots: 0,
        })
      );

      const queryRawMock = jest
        .fn()
        .mockResolvedValue([makeLockedListing({ totalSlots: 5, availableSlots: 1 })]);
      const updateMock = jest
        .fn()
        .mockResolvedValue({ ...mockListing, totalSlots: 7, availableSlots: 6 });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({ ...validPatchPayload, totalSlots: "7" }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("blocks totalSlots reductions before retired inventory sync can run", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        totalSlots: 5,
        availableSlots: 5,
      });
      (getFuturePeakReservedLoad as jest.Mock).mockResolvedValue(3);
      (getAvailability as jest.Mock).mockResolvedValue(
        makeAvailabilitySnapshot({
          totalSlots: 5,
          effectiveAvailableSlots: 2,
          acceptedSlots: 2,
          heldSlots: 1,
        })
      );

      const queryRawMock = jest
        .fn()
        .mockResolvedValue([makeLockedListing({ totalSlots: 5, availableSlots: 5 })]);
      const updateMock = jest
        .fn()
        .mockResolvedValue({ ...mockListing, totalSlots: 4, availableSlots: 1 });

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({ ...validPatchPayload, totalSlots: "4" }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      expect(getFuturePeakReservedLoad).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(syncFutureInventoryTotalSlots).not.toHaveBeenCalled();
    });

    it("keeps totalSlots changes on the contact-first inventory editor path", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...mockListing,
        totalSlots: 5,
        availableSlots: 5,
      });
      (getFuturePeakReservedLoad as jest.Mock).mockResolvedValue(4);

      const queryRawMock = jest
        .fn()
        .mockResolvedValue([makeLockedListing({ totalSlots: 5, availableSlots: 5 })]);
      const updateMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({ ...validPatchPayload, totalSlots: "3" }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toEqual({
        error:
          "Availability is managed by the contact-first inventory editor. Reload and use the availability editor.",
        code: "HOST_MANAGED_WRITE_PATH_REQUIRED",
      });
      expect(getAvailability).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(syncFutureInventoryTotalSlots).not.toHaveBeenCalled();
    });

    it("does not call retired live availability checks for generic totalSlots edits", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      (getAvailability as jest.Mock).mockResolvedValue(null);

      const queryRawMock = jest
        .fn()
        .mockResolvedValue([makeLockedListing({ totalSlots: 5, availableSlots: 5 })]);
      const updateMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
        const tx = {
          $queryRaw: queryRawMock,
          listing: { update: updateMock },
          location: { update: jest.fn() },
          $executeRaw: jest.fn(),
        };
        return callback(tx);
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({ ...validPatchPayload, totalSlots: "7" }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(409);
      expect(getAvailability).not.toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
      expect(syncFutureInventoryTotalSlots).not.toHaveBeenCalled();
    });

    it("returns 404 when transaction lock recheck finds ownership changed", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      const queryRawMock = jest
        .fn()
        .mockResolvedValue([
          { ownerId: "attacker-456", totalSlots: 2, availableSlots: 2 },
        ]);
      const updateMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            $queryRaw: queryRawMock,
            listing: { update: updateMock },
            location: { update: jest.fn() },
            $executeRaw: jest.fn(),
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(validPatchPayload),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Listing not found");
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(queryRawMock).toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("returns 404 when listing disappears before transaction lock recheck", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);
      const queryRawMock = jest.fn().mockResolvedValue([]);
      const updateMock = jest.fn();

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback) => {
          const tx = {
            $queryRaw: queryRawMock,
            listing: { update: updateMock },
            location: { update: jest.fn() },
            $executeRaw: jest.fn(),
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify(validPatchPayload),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Listing not found");
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(queryRawMock).toHaveBeenCalled();
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("returns 404 when listing does not exist", async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(null);

      const request = new Request("http://localhost/api/listings/nonexistent", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          title: "Hacked Title",
          description: "Test",
          price: "1000",
          totalSlots: "1",
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "nonexistent" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Listing not found");
    });

    it("returns 401 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          title: "Hacked Title",
          description: "Test",
          price: "1000",
          totalSlots: "1",
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("DELETE /api/listings/[id]", () => {
    it("returns 404 when non-owner tries to delete listing", async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      // Transaction callback runs: $queryRaw returns listing owned by owner-123,
      // but session user is attacker-456, so it throws NOT_FOUND_OR_UNAUTHORIZED.
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValue([
                { ownerId: "owner-123", title: "Test Listing", images: [] },
              ]),
            booking: { count: jest.fn(), findMany: jest.fn() },
            notification: { create: jest.fn() },
            listing: { delete: jest.fn() },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Listing not found");
    });

    it("allows owner to delete their own listing", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValue([
                { ownerId: "owner-123", title: "Test Listing", images: [] },
              ]),
            booking: {
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn().mockResolvedValue([]),
            },
            notification: { create: jest.fn() },
            report: { count: jest.fn().mockResolvedValue(0) },
            listing: { delete: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it("suppresses reported owner listings without exposing report state", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      const reportCount = jest.fn().mockResolvedValue(2);
      const listingUpdate = jest.fn().mockResolvedValue({});
      const listingDelete = jest.fn().mockResolvedValue({});
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([
              {
                ownerId: "owner-123",
                images: [
                  "https://test.supabase.co/storage/v1/object/public/images/listings/reported.jpg",
                ],
                version: 7,
              },
            ]),
            report: { count: reportCount },
            listing: {
              update: listingUpdate,
              delete: listingDelete,
            },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        notifiedTenants: 0,
      });
      expect(reportCount).toHaveBeenCalledWith({
        where: { listingId: "listing-abc" },
      });
      expect(listingUpdate).toHaveBeenCalledWith({
        where: { id: "listing-abc" },
        data: {
          status: "PAUSED",
          statusReason: "SUPPRESSED",
          version: 8,
        },
      });
      expect(listingDelete).not.toHaveBeenCalled();
      expect(markListingDirtyInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-abc",
        "status_changed"
      );
      expect(syncListingLifecycleProjectionInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-abc",
        { role: "host", id: "owner-123" }
      );
      expect(createClient).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        "Owner listing delete suppressed",
        expect.objectContaining({
          action: "ownerDeleteListingSuppressed",
          listingId: "listing-abc",
          ownerId: "owner-123",
          reportCount: 2,
        })
      );
      const logMeta = (logger.info as jest.Mock).mock.calls[0][1];
      expect(logMeta.reason).toBeUndefined();
      expect(logMeta.details).toBeUndefined();
      expect(logMeta.reporterId).toBeUndefined();
      expect(logMeta.title).toBeUndefined();
    });

    it("hard-deletes unreported listings and runs storage cleanup", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      const reportCount = jest.fn().mockResolvedValue(0);
      const listingDelete = jest.fn().mockResolvedValue({});
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([
              {
                ownerId: "owner-123",
                images: [
                  "https://test.supabase.co/storage/v1/object/public/images/listings/clean.jpg",
                ],
                version: 3,
              },
            ]),
            report: { count: reportCount },
            listing: { delete: listingDelete },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        success: true,
        notifiedTenants: 0,
      });
      expect(reportCount).toHaveBeenCalledWith({
        where: { listingId: "listing-abc" },
      });
      expect(listingDelete).toHaveBeenCalledWith({
        where: { id: "listing-abc" },
      });
      expect(tombstoneListingInventoryInTx).toHaveBeenCalledWith(
        expect.any(Object),
        "listing-abc",
        "TOMBSTONE"
      );
      expect(markListingDirtyInTx).not.toHaveBeenCalled();
      expect(createClient).toHaveBeenCalled();
    });

    it("requires password proof for password-backed listing deletion", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashed-password",
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "PASSWORD_REQUIRED",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects password-backed listing deletion with an invalid password", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashed-password",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrong-password" }),
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "PASSWORD_INVALID",
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "wrong-password",
        "hashed-password"
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("allows password-backed listing deletion with a valid password", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: "hashed-password",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([
              {
                ownerId: "owner-123",
                title: "Test Listing",
                images: [],
                version: 3,
              },
            ]),
            report: { count: jest.fn().mockResolvedValue(0) },
            listing: { delete: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "secret" }),
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(200);
      expect(bcrypt.compare).toHaveBeenCalledWith("secret", "hashed-password");
    });

    it("allows OAuth-only listing deletion with fresh authTime", async () => {
      (auth as jest.Mock).mockResolvedValue({
        ...ownerSession,
        authTime: Math.floor(Date.now() / 1000),
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([
              {
                ownerId: "owner-123",
                title: "Test Listing",
                images: [],
                version: 3,
              },
            ]),
            report: { count: jest.fn().mockResolvedValue(0) },
            listing: { delete: jest.fn().mockResolvedValue({}) },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ success: true });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("rejects OAuth-only listing deletion with stale authTime", async () => {
      (auth as jest.Mock).mockResolvedValue({
        ...ownerSession,
        authTime: Math.floor(Date.now() / 1000) - 301,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "SESSION_FRESHNESS_REQUIRED",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects OAuth-only listing deletion without authTime", async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: ownerSession.user,
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        password: null,
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "SESSION_FRESHNESS_REQUIRED",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("returns 404 when listing does not exist", async () => {
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      // Transaction callback: $queryRaw returns empty array (no listing found),
      // so it throws NOT_FOUND_OR_UNAUTHORIZED -> caught as 404
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest.fn().mockResolvedValue([]), // No listing found
            booking: { count: jest.fn(), findMany: jest.fn() },
            notification: { create: jest.fn() },
            report: { count: jest.fn().mockResolvedValue(0) },
            listing: { delete: jest.fn() },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/nonexistent", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "nonexistent" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Listing not found");
    });

    it("returns 401 when not authenticated", async () => {
      (auth as jest.Mock).mockResolvedValue(null);

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("allows deletion without checking retired booking rows", async () => {
      (auth as jest.Mock).mockResolvedValue(ownerSession);
      // Transaction callback: listing found and owned, but has active bookings
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            $queryRaw: jest
              .fn()
              .mockResolvedValue([
                { ownerId: "owner-123", title: "Test Listing", images: [] },
              ]),
            booking: {
              count: jest.fn().mockResolvedValue(2), // 2 active ACCEPTED bookings
              findMany: jest.fn(),
            },
            notification: { create: jest.fn() },
            report: { count: jest.fn().mockResolvedValue(0) },
            listing: { delete: jest.fn() },
          };
          return callback(tx);
        }
      );

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "DELETE",
      });

      const response = await DELETE(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("handles case where user.id is undefined in session", async () => {
      (auth as jest.Mock).mockResolvedValue({
        user: { email: "test@example.com" },
      });

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          ...validPatchPayload,
          title: "Test",
          description: "Test",
          price: "1000",
          totalSlots: "1",
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      expect(response.status).toBe(401);
    });

    it("rejects IDOR attempt with manipulated listing ID in body", async () => {
      // Attacker tries to include different listing ID in body
      (auth as jest.Mock).mockResolvedValue(attackerSession);
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);

      const request = new Request("http://localhost/api/listings/listing-abc", {
        method: "PATCH",
        body: JSON.stringify({
          id: "other-listing-xyz", // Attacker tries to inject different ID
          title: "Hacked Title",
          description: "Test",
          price: "1000",
          totalSlots: "1",
          address: "123 Main St",
          city: "San Francisco",
          state: "CA",
          zip: "94102",
        }),
      });

      const response = await PATCH(request, {
        params: Promise.resolve({ id: "listing-abc" }),
      });

      // Should still check ownership of listing-abc (from URL), not body
      expect(response.status).toBe(404);
    });
  });
});

describe("Suspension + IDOR Combined", () => {
  const mockListing = {
    id: "listing-abc",
    ownerId: "owner-123",
    title: "Test Listing",
    description: "A test listing",
    price: 1000,
    amenities: [],
    houseRules: [],
    householdLanguages: [],
    totalSlots: 2,
    availableSlots: 2,
    images: [],
    location: {
      id: "loc-123",
      address: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94102",
    },
  };

  const validPatchPayload = {
    title: "Updated Title",
    description: "Updated description",
    price: "1200",
    totalSlots: "2",
    address: "123 Main St",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("suspended owner gets 403 for suspension, not allowed to proceed", async () => {
    const { checkSuspension } = jest.requireMock("@/app/actions/suspension");
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "owner-123", email: "owner@example.com" },
    });
    (checkSuspension as jest.Mock).mockResolvedValue({
      suspended: true,
      error: "Account suspended",
    });
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);

    const request = new Request("http://localhost/api/listings/listing-abc", {
      method: "PATCH",
      body: JSON.stringify(validPatchPayload),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "listing-abc" }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("suspended");
    // Listing should NOT be updated
    expect(prisma.listing.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("suspended non-owner gets 403 for suspension, not 404", async () => {
    const { checkSuspension } = jest.requireMock("@/app/actions/suspension");
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "attacker-456", email: "attacker@example.com" },
    });
    (checkSuspension as jest.Mock).mockResolvedValue({
      suspended: true,
      error: "Account suspended",
    });
    // Even though attacker doesn't own the listing, suspension check fires first
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(mockListing);

    const request = new Request("http://localhost/api/listings/listing-abc", {
      method: "PATCH",
      body: JSON.stringify(validPatchPayload),
    });

    const response = await PATCH(request, {
      params: Promise.resolve({ id: "listing-abc" }),
    });

    // Should get 403 for suspension, NOT 404 for "not found" or 403 for "forbidden" (IDOR)
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("suspended");
    // Listing lookup should NOT have been reached
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
