import React from "react";
import { render, screen } from "@testing-library/react";
import ListingPage from "@/app/listings/[id]/page";
import { prisma } from "@/lib/prisma";
import { getReviews } from "@/lib/data";
import { getAvailability } from "@/lib/availability";
import { auth } from "@/auth";
import { features } from "@/lib/env";

const mockedFeatures = features as {
  semanticSearch: boolean;
  softHoldsEnabled: boolean;
  contactFirstListings: boolean;
};

const mockListingPageClient = jest.fn(
  (props: Record<string, unknown>) => (
    <div
      data-testid="listing-page-client"
      data-props={JSON.stringify(props)}
    />
  )
);

jest.mock("@/app/listings/[id]/ListingPageClient", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => mockListingPageClient(props),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    listing: {
      findUnique: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

jest.mock("@/lib/data", () => ({
  getReviews: jest.fn(),
}));

jest.mock("@/lib/availability", () => ({
  getAvailability: jest.fn(),
}));

jest.mock("@/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  features: {
    semanticSearch: false,
    softHoldsEnabled: true,
    contactFirstListings: false,
  },
}));

jest.mock("@/app/api/metrics/hmac", () => ({
  generateViewToken: jest.fn(() => "view-token-1"),
}));

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

describe("ListingPage SSR availability bootstrap", () => {
  const listing = {
    id: "listing-123",
    ownerId: "owner-123",
    title: "Sunny room",
    description: "A quiet room in the city.",
    price: 1400,
    images: ["https://example.com/room.jpg"],
    amenities: ["Wifi"],
    householdLanguages: ["en"],
    totalSlots: 4,
    availableSlots: 4,
    availabilitySource: "LEGACY_BOOKING",
    bookingMode: "SHARED",
    holdTtlMinutes: 20,
    status: "ACTIVE",
    viewCount: 3,
    genderPreference: null,
    householdGender: null,
    owner: {
      id: "owner-123",
      name: "Host",
      image: null,
      bio: null,
      isVerified: true,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    },
    location: null,
  };

  const availabilitySnapshot = {
    listingId: "listing-123",
    totalSlots: 4,
    effectiveAvailableSlots: 2,
    heldSlots: 1,
    acceptedSlots: 1,
    rangeVersion: 7,
    asOf: "2026-04-14T18:00:00.000Z",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(listing);
    (prisma.booking.findMany as jest.Mock).mockResolvedValue([]);
    (getReviews as jest.Mock).mockResolvedValue([]);
    (getAvailability as jest.Mock).mockResolvedValue(availabilitySnapshot);
    (auth as jest.Mock).mockResolvedValue(null);
  });

  it("passes valid start/end query params into getAvailability and bootstraps the client", async () => {
    render(
      await ListingPage({
        params: Promise.resolve({ id: "listing-123" }),
        searchParams: Promise.resolve({
          startDate: "2026-05-01",
          endDate: "2026-06-01",
        }),
      })
    );

    expect(getAvailability).toHaveBeenCalledWith("listing-123", {
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(screen.getByTestId("listing-page-client")).toBeInTheDocument();
    expect(mockListingPageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initialStartDate: "2026-05-01",
        initialEndDate: "2026-06-01",
        initialAvailability: availabilitySnapshot,
        listing: expect.objectContaining({
          availableSlots: availabilitySnapshot.effectiveAvailableSlots,
        }),
      })
    );
  });

  it("falls back to no-range availability when only one query date is present", async () => {
    render(
      await ListingPage({
        params: Promise.resolve({ id: "listing-123" }),
        searchParams: Promise.resolve({
          startDate: "2026-05-01",
        }),
      })
    );

    expect(getAvailability).toHaveBeenCalledWith("listing-123");
    expect(mockListingPageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initialStartDate: undefined,
        initialEndDate: undefined,
      })
    );
  });

  it("accepts legacy moveInDate plus endDate during the transition", async () => {
    render(
      await ListingPage({
        params: Promise.resolve({ id: "listing-123" }),
        searchParams: Promise.resolve({
          moveInDate: "2026-05-01",
          endDate: "2026-06-01",
        }),
      })
    );

    expect(getAvailability).toHaveBeenCalledWith("listing-123", {
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(mockListingPageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initialStartDate: "2026-05-01",
        initialEndDate: "2026-06-01",
      })
    );
  });

  it("prefers canonical startDate over legacy moveInDate when both are present", async () => {
    render(
      await ListingPage({
        params: Promise.resolve({ id: "listing-123" }),
        searchParams: Promise.resolve({
          startDate: "2026-07-01",
          moveInDate: "2026-05-01",
          endDate: "2026-08-01",
        }),
      })
    );

    expect(getAvailability).toHaveBeenCalledWith("listing-123", {
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(mockListingPageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initialStartDate: "2026-07-01",
        initialEndDate: "2026-08-01",
      })
    );
  });

  it("falls back to no-range availability when the query range is invalid", async () => {
    render(
      await ListingPage({
        params: Promise.resolve({ id: "listing-123" }),
        searchParams: Promise.resolve({
          startDate: "2026-06-01",
          endDate: "2026-05-01",
        }),
      })
    );

    expect(getAvailability).toHaveBeenCalledWith("listing-123");
    expect(mockListingPageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        initialStartDate: undefined,
        initialEndDate: undefined,
      })
    );
  });

  it("keeps guest detail on the sanitized path and skips exact coordinates", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ...listing,
      location: { city: "San Francisco", state: "CA" },
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { lat: 37.77, lng: -122.41 },
    ]);

    render(
      await ListingPage({
        params: Promise.resolve({ id: "listing-123" }),
        searchParams: Promise.resolve({}),
      })
    );

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(mockListingPageClient).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinates: null,
        canViewExactLocation: false,
      })
    );
  });

  it("returns notFound for guest access to migration-review listings", async () => {
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
      ...listing,
      availabilitySource: "HOST_MANAGED",
      statusReason: "MIGRATION_REVIEW",
      needsMigrationReview: true,
      openSlots: 1,
      availableUntil: new Date("2026-12-01T00:00:00.000Z"),
      lastConfirmedAt: new Date("2026-04-10T12:00:00.000Z"),
    });

    await expect(
      ListingPage({
        params: Promise.resolve({ id: "listing-123" }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
