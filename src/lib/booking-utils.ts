import "server-only";

import { prisma } from "./prisma";

/**
 * Get all active bookings (PENDING, ACCEPTED, or active HELD) for a listing
 * that are still relevant (end date in the future).
 * HELD bookings are only included if their hold has not expired.
 */
export async function getActiveBookingsForListing(listingId: string) {
  return prisma.booking.findMany({
    where: {
      listingId,
      OR: [
        {
          status: { in: ["PENDING", "ACCEPTED"] },
          endDate: { gte: new Date() },
        },
        {
          status: "HELD",
          heldUntil: { gt: new Date() },
        },
      ],
    },
    include: {
      tenant: { select: { id: true, name: true } },
    },
  });
}

/**
 * Check if a listing has any non-terminal bookings.
 * Used to determine if listing can be deleted.
 * Includes PENDING, ACCEPTED (with future endDate), and active HELD.
 * Excludes ghost holds (HELD with expired heldUntil).
 */
export async function hasNonTerminalBookings(
  listingId: string
): Promise<boolean> {
  const count = await prisma.booking.count({
    where: {
      listingId,
      OR: [
        {
          status: { in: ["PENDING", "ACCEPTED"] },
          endDate: { gte: new Date() },
        },
        {
          status: "HELD",
          heldUntil: { gt: new Date() },
        },
      ],
    },
  });
  return count > 0;
}

// Keep old name as alias for backward compatibility during migration
export const hasActiveAcceptedBookings = hasNonTerminalBookings;

/**
 * Get count of active bookings for a listing.
 * Counts ACCEPTED (with future endDate) and active HELD (not expired).
 */
export async function getActiveAcceptedBookingsCount(
  listingId: string
): Promise<number> {
  return prisma.booking.count({
    where: {
      listingId,
      OR: [
        {
          status: { in: ["ACCEPTED"] },
          endDate: { gte: new Date() },
        },
        {
          status: "HELD",
          heldUntil: { gt: new Date() },
        },
      ],
    },
  });
}
