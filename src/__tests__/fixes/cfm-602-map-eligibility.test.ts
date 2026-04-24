jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  },
}));

const mockQueryWithTimeout = jest.fn().mockResolvedValue([]);

jest.mock("@/lib/query-timeout", () => ({
  queryWithTimeout: (...args: unknown[]) => mockQueryWithTimeout(...args),
}));

import { getMapListings } from "@/lib/data";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function createIsoTimestamp(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * ONE_DAY_MS).toISOString();
}

function createIsoDate(daysFromNow: number): string {
  return createIsoTimestamp(daysFromNow).slice(0, 10);
}

function createRawMapRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "eligible-host-managed",
    title: "Eligible Host Managed Listing",
    price: 1800,
    availableSlots: 2,
    totalSlots: 4,
    availabilitySource: "HOST_MANAGED",
    openSlots: 2,
    availableUntil: createIsoDate(120),
    minStayMonths: 3,
    lastConfirmedAt: createIsoTimestamp(-1),
    statusReason: null,
    needsMigrationReview: false,
    status: "ACTIVE",
    moveInDate: createIsoDate(30),
    roomType: "private",
    images: ["primary-image.jpg"],
    city: "San Francisco",
    state: "CA",
    lng: -122.4194,
    lat: 37.7749,
    avgRating: 4.8,
    reviewCount: 12,
    ...overrides,
  };
}

describe("CFM-602 legacy map eligibility cutover", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("suppresses legacy map rows that fail canonical public-search eligibility while preserving compatible shape", async () => {
    mockQueryWithTimeout.mockResolvedValue([
      createRawMapRow(),
      createRawMapRow({
        id: "invalid-host-managed",
        openSlots: 0,
      }),
      createRawMapRow({
        id: "stale-host-managed",
        lastConfirmedAt: createIsoTimestamp(-30),
      }),
      createRawMapRow({
        id: "needs-migration-review",
        availabilitySource: "LEGACY_BOOKING",
        openSlots: null,
        availableSlots: 2,
        totalSlots: 2,
        needsMigrationReview: true,
      }),
      createRawMapRow({
        id: "status-migration-review",
        availabilitySource: "LEGACY_BOOKING",
        openSlots: null,
        availableSlots: 2,
        totalSlots: 2,
        needsMigrationReview: false,
        statusReason: "MIGRATION_REVIEW",
      }),
    ]);

    const results = await getMapListings({
      bounds: {
        minLat: 37.7,
        maxLat: 37.9,
        minLng: -122.6,
        maxLng: -122.3,
      },
    });

    expect(mockQueryWithTimeout).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQueryWithTimeout.mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(sql).toContain(`COALESCE(FALSE, FALSE) = FALSE`);
    expect(sql).toContain(
      `COALESCE(l."statusReason", '') <> 'MIGRATION_REVIEW'`
    );
    expect(sql).not.toContain(`l."needsMigrationReview"`);
    expect(params.slice(0, 2)).toEqual([1, 1]);

    expect(results.map((listing) => listing.id)).toEqual([
      "eligible-host-managed",
    ]);
    expect(results[0]).toMatchObject({
      id: "eligible-host-managed",
      title: "Eligible Host Managed Listing",
      images: ["primary-image.jpg"],
      availabilitySource: "HOST_MANAGED",
      availableSlots: 2,
      totalSlots: 4,
      status: "ACTIVE",
      statusReason: null,
      location: {
        city: "San Francisco",
        state: "CA",
        lat: 37.7749,
        lng: -122.4194,
      },
    });
    expect(results[0].publicAvailability).toMatchObject({
      availabilitySource: "HOST_MANAGED",
      openSlots: 2,
      totalSlots: 4,
      searchEligible: true,
    });
  });
});
