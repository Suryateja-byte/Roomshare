/**
 * Tests for booking utility functions
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import {
  getActiveBookingsForListing,
  hasActiveAcceptedBookings,
  hasNonTerminalBookings,
  getActiveAcceptedBookingsCount,
} from "@/lib/booking-utils";
import { prisma } from "@/lib/prisma";

describe("booking-utils", () => {
  const mockTenant = {
    id: "tenant-123",
    email: "tenant@example.com",
    name: "Tenant User",
  };

  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const mockBookings = [
    {
      id: "booking-1",
      listingId: "listing-123",
      status: "ACCEPTED",
      endDate: futureDate,
      tenant: mockTenant,
    },
    {
      id: "booking-2",
      listingId: "listing-123",
      status: "PENDING",
      endDate: futureDate,
      tenant: mockTenant,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getActiveBookingsForListing", () => {
    it("returns active bookings", async () => {
      (prisma.booking.findMany as jest.Mock).mockResolvedValue(mockBookings);

      const result = await getActiveBookingsForListing("listing-123");

      expect(result).toEqual(mockBookings);
      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: "listing-123",
          }),
        })
      );
    });

    it("uses OR filter to separate HELD from PENDING/ACCEPTED", async () => {
      (prisma.booking.findMany as jest.Mock).mockResolvedValue(mockBookings);

      await getActiveBookingsForListing("listing-123");

      const call = (prisma.booking.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(2);
      // PENDING/ACCEPTED filtered by endDate
      expect(call.where.OR[0].status).toEqual({
        in: ["PENDING", "ACCEPTED"],
      });
      expect(call.where.OR[0].endDate).toEqual({ gte: expect.any(Date) });
      // HELD filtered by heldUntil (not endDate)
      expect(call.where.OR[1].status).toBe("HELD");
      expect(call.where.OR[1].heldUntil).toEqual({ gt: expect.any(Date) });
    });

    it("includes tenant data", async () => {
      (prisma.booking.findMany as jest.Mock).mockResolvedValue(mockBookings);

      await getActiveBookingsForListing("listing-123");

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            tenant: { select: { id: true, name: true } },
          },
        })
      );
    });

    it("returns empty array when no active bookings", async () => {
      (prisma.booking.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getActiveBookingsForListing("listing-123");

      expect(result).toEqual([]);
    });
  });

  describe("hasNonTerminalBookings", () => {
    it("returns true when non-terminal booking exists", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(1);

      const result = await hasNonTerminalBookings("listing-123");

      expect(result).toBe(true);
    });

    it("returns false when no non-terminal bookings", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(0);

      const result = await hasNonTerminalBookings("listing-123");

      expect(result).toBe(false);
    });

    it("uses OR filter: PENDING/ACCEPTED by endDate, HELD by heldUntil", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(0);

      await hasNonTerminalBookings("listing-123");

      const call = (prisma.booking.count as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(2);
      // PENDING/ACCEPTED filtered by endDate
      expect(call.where.OR[0].status).toEqual({
        in: ["PENDING", "ACCEPTED"],
      });
      expect(call.where.OR[0].endDate).toEqual({ gte: expect.any(Date) });
      // HELD filtered by heldUntil (excludes ghost holds)
      expect(call.where.OR[1].status).toBe("HELD");
      expect(call.where.OR[1].heldUntil).toEqual({ gt: expect.any(Date) });
    });

    it("filters by listing ID", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(0);

      await hasNonTerminalBookings("listing-456");

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: "listing-456",
          }),
        })
      );
    });

    it("hasActiveAcceptedBookings is an alias for hasNonTerminalBookings", () => {
      expect(hasActiveAcceptedBookings).toBe(hasNonTerminalBookings);
    });
  });

  describe("getActiveAcceptedBookingsCount", () => {
    it("returns correct count", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(3);

      const result = await getActiveAcceptedBookingsCount("listing-123");

      expect(result).toBe(3);
    });

    it("returns 0 when no accepted bookings", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(0);

      const result = await getActiveAcceptedBookingsCount("listing-123");

      expect(result).toBe(0);
    });

    it("filters by listing ID", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(0);

      await getActiveAcceptedBookingsCount("listing-789");

      expect(prisma.booking.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            listingId: "listing-789",
          }),
        })
      );
    });

    it("uses OR filter: ACCEPTED by endDate, HELD by heldUntil", async () => {
      (prisma.booking.count as jest.Mock).mockResolvedValue(0);

      await getActiveAcceptedBookingsCount("listing-123");

      const call = (prisma.booking.count as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(2);
      // ACCEPTED filtered by endDate
      expect(call.where.OR[0].status).toEqual({ in: ["ACCEPTED"] });
      expect(call.where.OR[0].endDate).toEqual({ gte: expect.any(Date) });
      // HELD filtered by heldUntil
      expect(call.where.OR[1].status).toBe("HELD");
      expect(call.where.OR[1].heldUntil).toEqual({ gt: expect.any(Date) });
    });
  });

  describe("error handling", () => {
    it("propagates database errors from findMany", async () => {
      (prisma.booking.findMany as jest.Mock).mockRejectedValue(
        new Error("Connection refused")
      );

      await expect(getActiveBookingsForListing("listing-123")).rejects.toThrow(
        "Connection refused"
      );
    });

    it("propagates database errors from count", async () => {
      (prisma.booking.count as jest.Mock).mockRejectedValue(
        new Error("Connection refused")
      );

      await expect(hasNonTerminalBookings("listing-123")).rejects.toThrow(
        "Connection refused"
      );
    });

    it("propagates database errors from getActiveAcceptedBookingsCount", async () => {
      (prisma.booking.count as jest.Mock).mockRejectedValue(
        new Error("Query timeout")
      );

      await expect(
        getActiveAcceptedBookingsCount("listing-123")
      ).rejects.toThrow("Query timeout");
    });
  });
});
