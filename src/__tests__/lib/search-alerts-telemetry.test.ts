jest.mock("@/lib/prisma", () => ({
  prisma: {
    savedSearch: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    listing: {
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/email", () => ({
  sendNotificationEmail: jest.fn(),
}));

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

jest.mock("@/lib/search/search-telemetry", () => ({
  recordLegacyUrlUsage: jest.fn(),
}));

import { sendNotificationEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { recordLegacyUrlUsage } from "@/lib/search/search-telemetry";
import {
  processSearchAlerts,
  triggerInstantAlerts,
} from "@/lib/search-alerts";

describe("search-alerts telemetry routing", () => {
  const mockUser = {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
    notificationPreferences: { emailSearchAlerts: true },
  };

  const baseSavedSearch = {
    id: "search-123",
    name: "Legacy Search",
    alertEnabled: true,
    alertFrequency: "DAILY" as const,
    lastAlertAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    filters: {},
    user: mockUser,
  };

  const newListing = {
    id: "listing-123",
    title: "Sunny Room in Brooklyn",
    description: "Great light and short commute",
    price: 1000,
    city: "New York",
    state: "NY",
    roomType: "PRIVATE",
    leaseDuration: "FLEXIBLE",
    amenities: ["WiFi", "Laundry"],
    houseRules: ["No Smoking"],
    moveInDate: "2026-05-15T00:00:00.000Z",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });
    (prisma.notification.create as jest.Mock).mockResolvedValue({});
    (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});
    (prisma.listing.count as jest.Mock).mockResolvedValue(2);
  });

  it("emits legacy saved-search telemetry and matches canonical filters in processSearchAlerts", async () => {
    (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseSavedSearch,
        filters: {
          startDate: "2026-06-01",
          minBudget: 500,
          maxBudget: 1500,
          where: "Brooklyn",
          city: "New York",
        },
      },
    ]);

    const result = await processSearchAlerts();

    expect(result.alertsSent).toBe(1);
    expect(recordLegacyUrlUsage).toHaveBeenCalledTimes(4);
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "startDate",
      surface: "saved-search",
    });
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "minBudget",
      surface: "saved-search",
    });
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "maxBudget",
      surface: "saved-search",
    });
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "where",
      surface: "saved-search",
    });
    expect(prisma.listing.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        price: { gte: 500, lte: 1500 },
        location: {
          city: { contains: "New York", mode: "insensitive" },
        },
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { moveInDate: null },
              { moveInDate: { lte: expect.any(Date) } },
            ]),
          }),
        ]),
      }),
    });
  });

  it("keeps canonical saved-search filters unchanged in processSearchAlerts", async () => {
    (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseSavedSearch,
        filters: {
          moveInDate: "2026-06-01",
          minPrice: 500,
          maxPrice: 1500,
          city: "New York",
        },
      },
    ]);

    const result = await processSearchAlerts();

    expect(result.alertsSent).toBe(1);
    expect(recordLegacyUrlUsage).not.toHaveBeenCalled();
    expect(prisma.listing.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        price: { gte: 500, lte: 1500 },
        location: {
          city: { contains: "New York", mode: "insensitive" },
        },
        AND: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { moveInDate: null },
              { moveInDate: { lte: expect.any(Date) } },
            ]),
          }),
        ]),
      }),
    });
  });

  it("skips malformed saved-search payloads in processSearchAlerts without throwing", async () => {
    (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseSavedSearch,
        filters: "garbage",
      },
    ]);

    const result = await processSearchAlerts();

    expect(result.errors).toBe(0);
    expect(result.alertsSent).toBe(0);
    expect(prisma.listing.count).not.toHaveBeenCalled();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(logger.sync.warn).toHaveBeenCalledWith(
      "Invalid saved search filters in DB, falling back to empty",
      expect.objectContaining({
        action: "parseSavedSearchFilters",
      })
    );
  });

  it("emits legacy saved-search telemetry in triggerInstantAlerts", async () => {
    (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseSavedSearch,
        alertFrequency: "INSTANT" as const,
        filters: {
          startDate: "2026-06-01",
          minBudget: 500,
          maxBudget: 1500,
          city: "New York",
        },
      },
    ]);

    const result = await triggerInstantAlerts(newListing);

    expect(result.sent).toBe(1);
    expect(recordLegacyUrlUsage).toHaveBeenCalledTimes(3);
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "startDate",
      surface: "saved-search",
    });
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "minBudget",
      surface: "saved-search",
    });
    expect(recordLegacyUrlUsage).toHaveBeenCalledWith({
      alias: "maxBudget",
      surface: "saved-search",
    });
  });

  it("keeps canonical saved-search filters unchanged in triggerInstantAlerts", async () => {
    (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseSavedSearch,
        alertFrequency: "INSTANT" as const,
        filters: {
          moveInDate: "2026-06-01",
          minPrice: 500,
          maxPrice: 1500,
          city: "New York",
        },
      },
    ]);

    const result = await triggerInstantAlerts(newListing);

    expect(result.sent).toBe(1);
    expect(recordLegacyUrlUsage).not.toHaveBeenCalled();
  });

  it("skips malformed saved-search payloads in triggerInstantAlerts without throwing", async () => {
    (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
      {
        ...baseSavedSearch,
        alertFrequency: "INSTANT" as const,
        filters: null,
      },
    ]);

    const result = await triggerInstantAlerts(newListing);

    expect(result.errors).toBe(0);
    expect(result.sent).toBe(0);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(logger.sync.warn).toHaveBeenCalledWith(
      "Invalid saved search filters in DB, falling back to empty",
      expect.objectContaining({
        action: "parseSavedSearchFilters",
      })
    );
  });
});
