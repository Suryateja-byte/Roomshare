/**
 * P1-5 regression: search alerts applied no geographic predicate at all.
 *
 * `processSearchAlerts` built its match query from price/roomType/amenities/
 * query/city and nothing else, and `matchesFilters` (the instant path) did the
 * same. A saved search scoped to a two-mile box in Austin therefore matched
 * every new ACTIVE listing in the country, and each false positive burned a
 * real Resend send.
 *
 * Bounds cannot be a Prisma `where` — Location.coords is
 * Unsupported("geometry") with no scalar lat/lng columns — so the scheduled
 * path applies a PostGIS prefilter and constrains the query by listing id.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback((jest.requireMock("@/lib/prisma") as { prisma: unknown }).prisma)
    ),
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    savedSearch: { findMany: jest.fn(), update: jest.fn() },
    alertSubscription: { upsert: jest.fn(), update: jest.fn() },
    alertDelivery: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    outboxEvent: { create: jest.fn() },
    listing: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    notification: { create: jest.fn() },
  },
}));

jest.mock("@/lib/email", () => ({ sendNotificationEmail: jest.fn() }));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  },
  sanitizeErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
}));

const mockGetUsersWithUnlockedSearchAlerts = jest.fn();
jest.mock("@/lib/payments/search-alert-paywall", () => ({
  getUsersWithUnlockedSearchAlerts: (...args: unknown[]) =>
    mockGetUsersWithUnlockedSearchAlerts(...args),
}));

import { processSearchAlerts, triggerInstantAlerts } from "@/lib/search-alerts";
import { prisma } from "@/lib/prisma";

/** Downtown Austin, roughly. */
const AUSTIN_BOUNDS = {
  minLat: 30.1,
  maxLat: 30.4,
  minLng: -97.9,
  maxLng: -97.5,
};

const AUSTIN_POINT = { lat: 30.2672, lng: -97.7431 };
const SEATTLE_POINT = { lat: 47.6062, lng: -122.3321 };

const mockUser = {
  id: "user-123",
  name: "Test User",
  email: "test@example.com",
  notificationPreferences: null,
};

function savedSearch(filters: Record<string, unknown>, overrides = {}) {
  return {
    id: "search-123",
    name: "Austin under $2000",
    alertEnabled: true,
    alertFrequency: "DAILY" as const,
    lastAlertAt: null,
    createdAt: new Date("2026-01-01"),
    filters,
    user: mockUser,
    ...overrides,
  };
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/**
 * Must satisfy resolvePublicListingVisibilityState — including a recent
 * lastConfirmedAt, since a stale listing is not publicly visible and would
 * make every assertion below pass for the wrong reason.
 */
function deliverableListing(id: string) {
  return {
    id,
    ownerId: "host-123",
    physicalUnitId: "unit-123",
    status: "ACTIVE",
    statusReason: null,
    needsMigrationReview: false,
    availabilitySource: "HOST_MANAGED",
    availableSlots: 1,
    totalSlots: 1,
    openSlots: 1,
    moveInDate: daysFromNow(30),
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: daysFromNow(-10),
  };
}

function newListing(point: { lat: number; lng: number }, city: string) {
  return {
    id: "listing-new",
    title: "Sunny room",
    description: "Nice place",
    price: 1200,
    city,
    state: city === "Austin" ? "TX" : "WA",
    roomType: "PRIVATE",
    leaseDuration: "FLEXIBLE",
    amenities: [],
    houseRules: [],
    lat: point.lat,
    lng: point.lng,
  };
}

describe("search alerts — geographic scoping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.KILL_SWITCH_DISABLE_ALERTS;
    mockGetUsersWithUnlockedSearchAlerts.mockImplementation(
      async (userIds: string[]) => new Set(userIds)
    );
    (prisma.alertSubscription.upsert as jest.Mock).mockResolvedValue({
      id: "subscription-123",
      savedSearchId: "search-123",
      userId: "user-123",
      channel: "EMAIL",
      frequency: "DAILY",
      active: true,
      lastDeliveredAt: null,
    });
    (prisma.alertDelivery.create as jest.Mock).mockResolvedValue({
      id: "delivery-123",
    });
    (prisma.alertDelivery.update as jest.Mock).mockResolvedValue({});
    (prisma.alertSubscription.update as jest.Mock).mockResolvedValue({});
    (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({ id: "ob-1" });
    (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      deliverableListing("listing-new")
    );
    (prisma.listing.count as jest.Mock).mockResolvedValue(0);
    (prisma.listing.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
  });

  describe("processSearchAlerts (scheduled)", () => {
    it("constrains the match query to listings inside the saved viewport", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        savedSearch({ ...AUSTIN_BOUNDS, maxPrice: 2000 }),
      ]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { id: "listing-austin" },
      ]);

      await processSearchAlerts();

      // The viewport prefilter ran...
      expect(prisma.$queryRaw).toHaveBeenCalled();

      // ...and its result scoped the match query. Without this the query is
      // nationwide and a Seattle listing under $2000 would match.
      const countWhere = (prisma.listing.count as jest.Mock).mock.calls[0][0]
        .where;
      expect(countWhere).toMatchObject({
        status: "ACTIVE",
        id: { in: ["listing-austin"] },
      });
    });

    it("matches nothing when no listing in the viewport is new", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        savedSearch({ ...AUSTIN_BOUNDS, maxPrice: 2000 }),
      ]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await processSearchAlerts();

      expect(result.alertsSent).toBe(0);
      expect(prisma.alertDelivery.create).not.toHaveBeenCalled();
      const countWhere = (prisma.listing.count as jest.Mock).mock.calls[0][0]
        .where;
      expect(countWhere).toMatchObject({ id: { in: [] } });
    });

    it("does not scope a saved search that has no viewport", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        savedSearch({ maxPrice: 2000 }),
      ]);

      await processSearchAlerts();

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      const countWhere = (prisma.listing.count as jest.Mock).mock.calls[0][0]
        .where;
      expect(countWhere).not.toHaveProperty("id");
    });
  });

  describe("triggerInstantAlerts", () => {
    const instant = (filters: Record<string, unknown>) =>
      savedSearch(filters, { alertFrequency: "INSTANT" as const });

    it("does not alert an Austin-bounded search about a Seattle listing", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        instant({ ...AUSTIN_BOUNDS, maxPrice: 2000 }),
      ]);

      const result = await triggerInstantAlerts(
        newListing(SEATTLE_POINT, "Seattle")
      );

      expect(result.sent).toBe(0);
      expect(prisma.alertDelivery.create).not.toHaveBeenCalled();
    });

    it("still alerts an Austin-bounded search about an Austin listing", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        instant({ ...AUSTIN_BOUNDS, maxPrice: 2000 }),
      ]);

      const result = await triggerInstantAlerts(
        newListing(AUSTIN_POINT, "Austin")
      );

      expect(result.sent).toBe(1);
    });

    it("does not match a listing whose coordinates are missing", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        instant({ ...AUSTIN_BOUNDS, maxPrice: 2000 }),
      ]);

      const withoutCoords = {
        ...newListing(AUSTIN_POINT, "Austin"),
        lat: undefined,
        lng: undefined,
      };

      const result = await triggerInstantAlerts(withoutCoords);

      expect(result.sent).toBe(0);
    });

    it("ignores geography for a saved search with no viewport", async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
        instant({ maxPrice: 2000 }),
      ]);

      const result = await triggerInstantAlerts(
        newListing(SEATTLE_POINT, "Seattle")
      );

      expect(result.sent).toBe(1);
    });
  });
});
