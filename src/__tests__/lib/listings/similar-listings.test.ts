process.env.ENABLE_SEMANTIC_SEARCH = "true";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock("@/lib/listings/public-detail", () => ({
  getPublicListingDetail: jest.fn(),
}));

jest.mock("@/lib/embeddings/version", () => ({
  getReadEmbeddingVersion: jest.fn(() => "test-embedding-version"),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
    },
  },
}));

import type { PublicListingDetailResult } from "@/lib/listings/public-detail";
import { prisma } from "@/lib/prisma";
import { getPublicListingDetail } from "@/lib/listings/public-detail";
import { getSimilarListingsForListing } from "@/lib/listings/similar-listings";

const mockQueryRaw = prisma.$queryRaw as jest.Mock;
const mockGetPublicListingDetail = getPublicListingDetail as jest.Mock;

interface SimilarListingRow {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  city: string;
  state: string;
  room_type: string | null;
  available_slots: number;
  total_slots: number;
  amenities: string[];
  household_languages: string[];
  avg_rating: number;
  review_count: number;
  similarity: number;
}

function makeSearchDocRow(
  id: string,
  overrides: Partial<SimilarListingRow> = {}
): SimilarListingRow {
  return {
    id,
    title: `Stale doc ${id}`,
    description: `Stale search document for ${id}`,
    price: 1000,
    images: [`/doc-${id}.jpg`],
    city: "Austin",
    state: "TX",
    room_type: "private_room",
    available_slots: 1,
    total_slots: 2,
    amenities: ["doc-wifi"],
    household_languages: ["english"],
    avg_rating: 4.4,
    review_count: 8,
    similarity: 0.9,
    ...overrides,
  };
}

function makePublicDetail(
  id: string,
  overrides: {
    title?: string;
    price?: number;
    openSlots?: number;
    totalSlots?: number;
    city?: string;
    state?: string;
  } = {}
): PublicListingDetailResult {
  const openSlots = overrides.openSlots ?? 1;
  const totalSlots = overrides.totalSlots ?? 2;

  return {
    listing: {
      id,
      ownerId: "owner-1",
      physicalUnitId: null,
      title: overrides.title ?? `Live listing ${id}`,
      description: `Live description for ${id}`,
      price: overrides.price ?? 1250,
      images: [`/live-${id}.jpg`],
      amenities: ["live-wifi"],
      householdLanguages: ["spanish"],
      totalSlots,
      availableSlots: openSlots,
      openSlots,
      moveInDate: new Date("2026-06-01T00:00:00.000Z"),
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: new Date("2026-05-15T00:00:00.000Z"),
      statusReason: null,
      status: "ACTIVE",
      viewCount: 0,
      version: 1,
      genderPreference: null,
      householdGender: null,
      owner: {
        id: "owner-1",
        name: "Host",
        image: null,
        bio: null,
        isVerified: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      location: {
        city: overrides.city ?? "Dallas",
        state: overrides.state ?? "TX",
      },
    },
    publicAvailability: {
      availabilitySource: "HOST_MANAGED",
      openSlots,
      totalSlots,
      availableFrom: "2026-06-01",
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: "2026-05-15T00:00:00.000Z",
      freshnessBucket: "NORMAL",
      searchEligible: true,
      staleAt: "2026-06-05T00:00:00.000Z",
      autoPauseAt: "2026-06-14T00:00:00.000Z",
      publicStatus: "AVAILABLE",
      effectiveAvailableSlots: openSlots,
      isValid: true,
      isPubliclyAvailable: true,
    },
    isPubliclyVisible: true,
    isOwner: false,
    isAdmin: false,
    publicCacheMetadata: null,
  } as unknown as PublicListingDetailResult;
}

describe("getSimilarListingsForListing", () => {
  beforeEach(() => {
    process.env.ENABLE_SEMANTIC_SEARCH = "true";
    process.env.KILL_SWITCH_DISABLE_SEMANTIC_SEARCH = "false";
    jest.clearAllMocks();
  });

  it("revalidates semantic candidates through public detail visibility", async () => {
    mockQueryRaw.mockResolvedValue([
      makeSearchDocRow("stale-candidate"),
      makeSearchDocRow("visible-candidate", {
        title: "Outdated search title",
        price: 999,
      }),
    ]);
    mockGetPublicListingDetail.mockImplementation((id: string) => {
      if (id === "stale-candidate") return Promise.resolve(null);
      if (id === "visible-candidate") {
        return Promise.resolve(
          makePublicDetail(id, {
            title: "Live visible title",
            price: 1500,
            openSlots: 2,
            totalSlots: 3,
            city: "Houston",
          })
        );
      }
      return Promise.resolve(null);
    });

    const listings = await getSimilarListingsForListing("target-listing");

    expect(mockGetPublicListingDetail).toHaveBeenCalledWith("stale-candidate");
    expect(mockGetPublicListingDetail).toHaveBeenCalledWith(
      "visible-candidate"
    );
    expect(listings).toEqual([
      expect.objectContaining({
        id: "visible-candidate",
        title: "Live visible title",
        price: 1500,
        availableSlots: 2,
        totalSlots: 3,
        location: { city: "Houston", state: "TX" },
      }),
    ]);
  });

  it("preserves candidate order after filtering non-public listings", async () => {
    mockQueryRaw.mockResolvedValue([
      makeSearchDocRow("first-visible"),
      makeSearchDocRow("stale-middle"),
      makeSearchDocRow("second-visible"),
    ]);
    mockGetPublicListingDetail.mockImplementation((id: string) => {
      if (id === "stale-middle") return Promise.resolve(null);
      return Promise.resolve(makePublicDetail(id));
    });

    const listings = await getSimilarListingsForListing("target-order");

    expect(listings.map((listing) => listing.id)).toEqual([
      "first-visible",
      "second-visible",
    ]);
  });

  it("returns at most four public listings even when more candidates are fetched", async () => {
    mockQueryRaw.mockResolvedValue(
      Array.from({ length: 6 }, (_, index) =>
        makeSearchDocRow(`visible-${index + 1}`)
      )
    );
    mockGetPublicListingDetail.mockImplementation((id: string) =>
      Promise.resolve(makePublicDetail(id))
    );

    const listings = await getSimilarListingsForListing("target-limit");

    expect(listings.map((listing) => listing.id)).toEqual([
      "visible-1",
      "visible-2",
      "visible-3",
      "visible-4",
    ]);
  });
});
