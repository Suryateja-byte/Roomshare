/**
 * Tests for getListingAvailability — ghost-hold aware availability query.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { getListingAvailability } from "@/lib/listing-availability";

describe("getListingAvailability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns availability with no ghost holds", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      { availableSlots: 3, effectiveAvailable: 3, ghostHolds: 0 },
    ]);

    const result = await getListingAvailability("listing-123");

    expect(result).toEqual({
      availableSlots: 3,
      effectiveAvailable: 3,
      ghostHolds: 0,
    });
  });

  it("returns effective availability accounting for ghost holds", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      { availableSlots: 1, effectiveAvailable: 3, ghostHolds: 2 },
    ]);

    const result = await getListingAvailability("listing-123");

    expect(result).toEqual({
      availableSlots: 1,
      effectiveAvailable: 3,
      ghostHolds: 2,
    });
  });

  it("returns null when listing not found", async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);

    const result = await getListingAvailability("nonexistent");

    expect(result).toBeNull();
  });

  it("excludes active (non-expired) holds from ghost count", async () => {
    // Active holds are NOT ghost holds — only expired HELD bookings are
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([
      { availableSlots: 2, effectiveAvailable: 2, ghostHolds: 0 },
    ]);

    const result = await getListingAvailability("listing-with-active-holds");

    expect(result?.ghostHolds).toBe(0);
    expect(result?.availableSlots).toBe(result?.effectiveAvailable);
  });

  it("propagates database errors", async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(
      new Error("Connection refused")
    );

    await expect(
      getListingAvailability("listing-123")
    ).rejects.toThrow("Connection refused");
  });

  it("handles undefined result from destructuring", async () => {
    // When $queryRaw returns an array with undefined first element
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([undefined]);

    const result = await getListingAvailability("listing-123");

    // undefined || null → null
    expect(result).toBeNull();
  });
});
