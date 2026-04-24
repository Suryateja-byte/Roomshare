/**
 * Tests for search-alerts utility functions
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback((jest.requireMock("@/lib/prisma") as { prisma: unknown }).prisma)
    ),
    savedSearch: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    alertSubscription: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    alertDelivery: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
    listing: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
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

const mockGetUsersWithUnlockedSearchAlerts = jest.fn();
jest.mock("@/lib/payments/search-alert-paywall", () => ({
  getUsersWithUnlockedSearchAlerts: (...args: unknown[]) =>
    mockGetUsersWithUnlockedSearchAlerts(...args),
}));

import {
  deliverQueuedSearchAlert,
  processSearchAlerts,
  triggerInstantAlerts,
} from "@/lib/search-alerts";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

describe("search-alerts", () => {
  const originalDisableAlerts = process.env.KILL_SWITCH_DISABLE_ALERTS;
  function restoreDisableAlerts() {
    if (originalDisableAlerts === undefined) {
      delete process.env.KILL_SWITCH_DISABLE_ALERTS;
    } else {
      process.env.KILL_SWITCH_DISABLE_ALERTS = originalDisableAlerts;
    }
  }
  const mockUser = {
    id: "user-123",
    name: "Test User",
    email: "test@example.com",
    notificationPreferences: { emailSearchAlerts: true },
  };

  const mockSavedSearch = {
    id: "search-123",
    name: "NYC Rooms",
    alertEnabled: true,
    alertFrequency: "DAILY",
    lastAlertAt: null,
    createdAt: new Date("2025-01-01"),
    filters: { city: "New York", minPrice: 500, maxPrice: 1500 },
    user: mockUser,
  };

  function buildPublicListing(id = "listing-123") {
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
      moveInDate: new Date("2026-05-01T00:00:00.000Z"),
      availableUntil: null,
      minStayMonths: 1,
      lastConfirmedAt: new Date("2026-04-20T00:00:00.000Z"),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    restoreDisableAlerts();
    (sendNotificationEmail as jest.Mock).mockResolvedValue({ success: true });
    (prisma.listing.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 5 }, (_, index) =>
        buildPublicListing(`listing-${index + 1}`)
      )
    );
    (prisma.listing.findUnique as jest.Mock).mockResolvedValue(
      buildPublicListing()
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
    (prisma.outboxEvent.create as jest.Mock).mockResolvedValue({
      id: "outbox-123",
    });
    mockGetUsersWithUnlockedSearchAlerts.mockImplementation(
      async (userIds: string[]) => new Set(userIds)
    );
  });

  afterAll(() => {
    restoreDisableAlerts();
  });

  describe("processSearchAlerts", () => {
    describe("finding saved searches", () => {
      it("processes searches with alerts enabled", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(0);
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(result.processed).toBe(1);
        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              alertEnabled: true,
            }),
          })
        );
      });

      it("includes searches that have never been alerted", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(0);
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        await processSearchAlerts();

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: expect.arrayContaining([{ lastAlertAt: null }]),
            }),
          })
        );
      });

      it("includes DAILY searches last alerted more than 24 hours ago", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);

        await processSearchAlerts();

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  alertFrequency: "DAILY",
                }),
              ]),
            }),
          })
        );
      });

      it("includes WEEKLY searches last alerted more than 7 days ago", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);

        await processSearchAlerts();

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  alertFrequency: "WEEKLY",
                }),
              ]),
            }),
          })
        );
      });

      it("includes user data with notification preferences", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);

        await processSearchAlerts();

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              user: expect.objectContaining({
                select: expect.objectContaining({
                  notificationPreferences: true,
                }),
              }),
            }),
          })
        );
      });
    });

    describe("notification preferences", () => {
      it("skips user with disabled search alerts", async () => {
        const disabledUser = {
          ...mockUser,
          notificationPreferences: { emailSearchAlerts: false },
        };
        const searchWithDisabled = { ...mockSavedSearch, user: disabledUser };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithDisabled,
        ]);
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(sendNotificationEmail).not.toHaveBeenCalled();
        expect(result.alertsSent).toBe(0);
      });

      it("skips user with no email", async () => {
        const noEmailUser = { ...mockUser, email: null };
        const searchWithNoEmail = { ...mockSavedSearch, user: noEmailUser };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithNoEmail,
        ]);
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(sendNotificationEmail).not.toHaveBeenCalled();
        expect(result.alertsSent).toBe(0);
      });
    });

    describe("matching listings", () => {
      it("sends alert when new listings match", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(5);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(result.alertsSent).toBe(1);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
        expect(prisma.alertDelivery.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            savedSearchId: mockSavedSearch.id,
            userId: mockUser.id,
            deliveryKind: "SCHEDULED",
            newListingsCount: 5,
          }),
          select: { id: true },
        });
        expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            aggregateType: "ALERT_DELIVERY",
            aggregateId: "delivery-123",
            kind: "ALERT_DELIVER",
          }),
          select: { id: true },
        });
      });

      it("does not send alert when no matching listings", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(0);
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(result.alertsSent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
      });

      it("drops matching daily alert targets that are no longer publicly visible", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(1);
        (prisma.listing.findMany as jest.Mock).mockResolvedValue([
          {
            ...buildPublicListing("listing-hidden"),
            status: "PAUSED",
            statusReason: "SUPPRESSED",
          },
        ]);
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(result.alertsSent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
      });

      it("creates durable delivery when listings match", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(3);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        await processSearchAlerts();

        expect(prisma.notification.create).not.toHaveBeenCalled();
        expect(prisma.alertDelivery.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            savedSearchId: mockSavedSearch.id,
            userId: mockUser.id,
            deliveryKind: "SCHEDULED",
          }),
          select: { id: true },
        });
      });

      it("does not count duplicate durable deliveries as errors", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(1);
        (prisma.alertDelivery.create as jest.Mock).mockRejectedValue({
          code: "P2002",
        });
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(result.alertsSent).toBe(0);
        expect(result.errors).toBe(0);
        expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
        expect(prisma.savedSearch.update).toHaveBeenCalledWith({
          where: { id: mockSavedSearch.id },
          data: { lastAlertAt: expect.any(Date) },
        });
      });

      it("updates lastAlertAt after processing", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(0);
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        await processSearchAlerts();

        expect(prisma.savedSearch.update).toHaveBeenCalledWith({
          where: { id: mockSavedSearch.id },
          data: { lastAlertAt: expect.any(Date) },
        });
      });

      it("suppresses delivery when alerts are locked for the user", async () => {
        mockGetUsersWithUnlockedSearchAlerts.mockResolvedValue(new Set());
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);

        const result = await processSearchAlerts();

        expect(result.alertsSent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
        expect(prisma.notification.create).not.toHaveBeenCalled();
        expect(prisma.savedSearch.update).not.toHaveBeenCalled();
      });
    });

    describe("error handling", () => {
      it("tracks errors for failed delivery enqueue", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
        ]);
        (prisma.listing.count as jest.Mock).mockResolvedValue(5);
        (prisma.alertDelivery.create as jest.Mock).mockRejectedValue(
          new Error("Queue failed")
        );
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(result.errors).toBe(1);
        expect(result.alertsSent).toBe(0);
      });

      it("continues processing after individual error", async () => {
        const secondSearch = {
          ...mockSavedSearch,
          id: "search-456",
          user: { ...mockUser, id: "user-456" },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          mockSavedSearch,
          secondSearch,
        ]);
        (prisma.listing.count as jest.Mock)
          .mockRejectedValueOnce(new Error("DB Error"))
          .mockResolvedValueOnce(3);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await processSearchAlerts();

        expect(result.processed).toBe(2);
        expect(result.errors).toBe(1);
        expect(result.alertsSent).toBe(1);
      });

      it("handles fatal error gracefully", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockRejectedValue(
          new Error("Fatal DB Error")
        );

        const result = await processSearchAlerts();

        expect(result.errors).toBe(1);
        expect(result.details).toEqual(
          expect.arrayContaining([expect.stringContaining("Fatal error")])
        );
      });
    });
  });

  describe("deliverQueuedSearchAlert", () => {
    function buildDelivery(overrides: Record<string, unknown> = {}) {
      return {
        id: "delivery-123",
        subscriptionId: "subscription-123",
        savedSearchId: "search-123",
        userId: "user-123",
        deliveryKind: "INSTANT",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60_000),
        targetListingId: "listing-123",
        targetUnitId: "unit-123",
        newListingsCount: 1,
        payload: {
          listingTitle: "Cozy Room",
          listingUrl: "/listings/listing-123",
        },
        subscription: {
          id: "subscription-123",
          active: true,
        },
        savedSearch: {
          id: "search-123",
          name: "NYC Rooms",
          filters: { city: "New York" },
          active: true,
          alertEnabled: true,
          user: mockUser,
        },
        ...overrides,
      };
    }

    it("sends only after final target, preference, and paywall revalidation", async () => {
      (prisma.alertDelivery.findUnique as jest.Mock).mockResolvedValue(
        buildDelivery()
      );
      (prisma.notification.create as jest.Mock).mockResolvedValue({});
      (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

      const result = await deliverQueuedSearchAlert(
        prisma as Parameters<typeof deliverQueuedSearchAlert>[0],
        "delivery-123"
      );

      expect(result).toEqual({ status: "delivered" });
      expect(sendNotificationEmail).toHaveBeenCalledWith(
        "searchAlert",
        mockUser.email,
        expect.objectContaining({
          searchName: "NYC Rooms",
          listingTitle: "a matching listing",
          listingId: "listing-123",
        })
      );
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUser.id,
          type: "SEARCH_ALERT",
          link: "/listings/listing-123",
        }),
      });
      expect(prisma.alertDelivery.update).toHaveBeenCalledWith({
        where: { id: "delivery-123" },
        data: expect.objectContaining({
          status: "DELIVERED",
          deliveredAt: expect.any(Date),
        }),
      });
    });

    it("drops tombstoned or unpublished delivery targets before email", async () => {
      (prisma.alertDelivery.findUnique as jest.Mock).mockResolvedValue(
        buildDelivery()
      );
      (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
        ...buildPublicListing("listing-123"),
        status: "PAUSED",
        statusReason: "SUPPRESSED",
      });

      const result = await deliverQueuedSearchAlert(
        prisma as Parameters<typeof deliverQueuedSearchAlert>[0],
        "delivery-123"
      );

      expect(result).toEqual({
        status: "dropped",
        reason: "TARGET_NOT_PUBLIC",
      });
      expect(sendNotificationEmail).not.toHaveBeenCalled();
      expect(prisma.alertDelivery.update).toHaveBeenCalledWith({
        where: { id: "delivery-123" },
        data: expect.objectContaining({
          status: "DROPPED",
          dropReason: "TARGET_NOT_PUBLIC",
        }),
      });
    });

    it("drops paywall-locked deliveries before email", async () => {
      mockGetUsersWithUnlockedSearchAlerts.mockResolvedValue(new Set());
      (prisma.alertDelivery.findUnique as jest.Mock).mockResolvedValue(
        buildDelivery()
      );

      const result = await deliverQueuedSearchAlert(
        prisma as Parameters<typeof deliverQueuedSearchAlert>[0],
        "delivery-123"
      );

      expect(result).toEqual({
        status: "dropped",
        reason: "PAYWALL_LOCKED",
      });
      expect(sendNotificationEmail).not.toHaveBeenCalled();
    });

    it("pauses matching and delivery when alerts are disabled", async () => {
      process.env.KILL_SWITCH_DISABLE_ALERTS = "true";

      const processResult = await processSearchAlerts();
      expect(processResult).toEqual({
        processed: 0,
        alertsSent: 0,
        errors: 0,
        details: ["Search alerts disabled by kill switch"],
      });
      expect(prisma.savedSearch.findMany).not.toHaveBeenCalled();

      const deliverResult = await deliverQueuedSearchAlert(
        prisma as Parameters<typeof deliverQueuedSearchAlert>[0],
        "delivery-123"
      );
      expect(deliverResult).toEqual({
        status: "retry",
        error: "Search alerts disabled",
      });
      expect(prisma.alertDelivery.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("triggerInstantAlerts", () => {
    const newListing = {
      id: "listing-123",
      title: "Cozy Room in NYC",
      description: "Great location",
      price: 1000,
      city: "New York",
      state: "NY",
      roomType: "PRIVATE",
      leaseDuration: "FLEXIBLE",
      amenities: ["WiFi", "AC"],
      houseRules: ["No Smoking"],
    };

    const instantSearch = {
      ...mockSavedSearch,
      alertFrequency: "INSTANT",
    };

    describe("finding instant alerts", () => {
      it("finds searches with INSTANT frequency", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);

        await triggerInstantAlerts(newListing);

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              alertEnabled: true,
              alertFrequency: "INSTANT",
            }),
          })
        );
      });

      it("includes user notification preferences", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);

        await triggerInstantAlerts(newListing);

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({
              user: expect.objectContaining({
                select: expect.objectContaining({
                  notificationPreferences: true,
                }),
              }),
            }),
          })
        );
      });
    });

    describe("filter matching", () => {
      it("sends alert when listing matches filters", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          instantSearch,
        ]);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(1);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
        expect(prisma.alertDelivery.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            savedSearchId: instantSearch.id,
            userId: mockUser.id,
            deliveryKind: "INSTANT",
            targetListingId: newListing.id,
            newListingsCount: 1,
          }),
          select: { id: true },
        });
      });

      it("drops matching instant alert targets that are no longer publicly visible", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          instantSearch,
        ]);
        (prisma.listing.findUnique as jest.Mock).mockResolvedValue({
          ...buildPublicListing(newListing.id),
          status: "PAUSED",
          statusReason: "SUPPRESSED",
        });

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
      });

      it("does not send alert when price below minPrice", async () => {
        const searchWithHighMinPrice = {
          ...instantSearch,
          filters: { minPrice: 2000 },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithHighMinPrice,
        ]);

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
      });

      it("does not send alert when price above maxPrice", async () => {
        const searchWithLowMaxPrice = {
          ...instantSearch,
          filters: { maxPrice: 500 },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithLowMaxPrice,
        ]);

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
      });

      it("does not send alert when city does not match", async () => {
        const searchWithDifferentCity = {
          ...instantSearch,
          filters: { city: "Los Angeles" },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithDifferentCity,
        ]);

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(0);
      });

      it("matches city case-insensitively", async () => {
        const searchWithLowerCity = {
          ...instantSearch,
          filters: { city: "new york" },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithLowerCity,
        ]);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(1);
      });

      it("matches query in title", async () => {
        const searchWithQuery = {
          ...instantSearch,
          filters: { query: "Cozy" },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithQuery,
        ]);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(1);
      });

      it("matches query in description", async () => {
        const searchWithDescQuery = {
          ...instantSearch,
          filters: { query: "location" },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          searchWithDescQuery,
        ]);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(1);
      });
    });

    describe("notifications", () => {
      it("creates durable instant delivery with listing details", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          instantSearch,
        ]);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        await triggerInstantAlerts(newListing);

        expect(prisma.notification.create).not.toHaveBeenCalled();
        expect(prisma.alertDelivery.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUser.id,
            deliveryKind: "INSTANT",
            targetListingId: newListing.id,
            payload: expect.objectContaining({
              listingUrl: `/listings/${newListing.id}`,
            }),
          }),
          select: { id: true },
        });
      });

      it("updates lastAlertAt after sending", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          instantSearch,
        ]);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        await triggerInstantAlerts(newListing);

        expect(prisma.savedSearch.update).toHaveBeenCalledWith({
          where: { id: instantSearch.id },
          data: { lastAlertAt: expect.any(Date) },
        });
      });

      it("suppresses instant delivery when alerts are locked for the user", async () => {
        mockGetUsersWithUnlockedSearchAlerts.mockResolvedValue(new Set());
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          instantSearch,
        ]);

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
        expect(prisma.notification.create).not.toHaveBeenCalled();
        expect(prisma.savedSearch.update).not.toHaveBeenCalled();
      });
    });

    describe("subscription cap", () => {
      it("enforces 500-subscription cap on instant alerts (G2.2)", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);

        await triggerInstantAlerts(newListing);

        expect(prisma.savedSearch.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 500,
          })
        );
      });
    });

    describe("notification preferences", () => {
      it("skips user with disabled alerts", async () => {
        const disabledSearch = {
          ...instantSearch,
          user: {
            ...mockUser,
            notificationPreferences: { emailSearchAlerts: false },
          },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          disabledSearch,
        ]);

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(0);
        expect(sendNotificationEmail).not.toHaveBeenCalled();
      });

      it("skips user without email", async () => {
        const noEmailSearch = {
          ...instantSearch,
          user: { ...mockUser, email: null },
        };
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          noEmailSearch,
        ]);

        const result = await triggerInstantAlerts(newListing);

        expect(result.sent).toBe(0);
      });
    });

    describe("error handling", () => {
      it("tracks error for failed delivery enqueue", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          instantSearch,
        ]);
        (prisma.alertDelivery.create as jest.Mock).mockRejectedValue(
          new Error("Queue failed")
        );

        const result = await triggerInstantAlerts(newListing);

        expect(result.errors).toBe(1);
        expect(result.sent).toBe(0);
      });

      it("handles fatal error gracefully", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockRejectedValue(
          new Error("DB Error")
        );

        const result = await triggerInstantAlerts(newListing);

        expect(result.errors).toBe(1);
        expect(result.sent).toBe(0);
      });
    });

    describe("PII compliance", () => {
      it("does not log userId in any logger call", async () => {
        (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([
          instantSearch,
        ]);
        (prisma.notification.create as jest.Mock).mockResolvedValue({});
        (prisma.savedSearch.update as jest.Mock).mockResolvedValue({});

        await triggerInstantAlerts(newListing);

        const mockLogger = logger.sync as unknown as Record<string, jest.Mock>;
        for (const method of ["debug", "info", "warn", "error"]) {
          for (const call of mockLogger[method].mock.calls) {
            const metadata = call[1];
            if (metadata && typeof metadata === "object") {
              expect(metadata).not.toHaveProperty("userId");
            }
          }
        }
      });
    });
  });
});
