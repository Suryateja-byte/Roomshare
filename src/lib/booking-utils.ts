import { prisma } from './prisma';

/**
 * Get all active bookings (PENDING or ACCEPTED) for a listing
 * that are still relevant (end date in the future)
 */
export async function getActiveBookingsForListing(listingId: string) {
  return prisma.booking.findMany({
    where: {
      listingId,
      status: { in: ['PENDING', 'ACCEPTED'] },
      endDate: { gte: new Date() }
    },
    include: {
      tenant: { select: { id: true, email: true, name: true } }
    }
  });
}

/**
 * Check if a listing has any active ACCEPTED bookings
 * Used to determine if listing can be deleted
 */
export async function hasActiveAcceptedBookings(listingId: string): Promise<boolean> {
  const count = await prisma.booking.count({
    where: {
      listingId,
      status: 'ACCEPTED',
      endDate: { gte: new Date() }
    }
  });
  return count > 0;
}

/**
 * Get count of active ACCEPTED bookings for a listing
 */
export async function getActiveAcceptedBookingsCount(listingId: string): Promise<number> {
  return prisma.booking.count({
    where: {
      listingId,
      status: 'ACCEPTED',
      endDate: { gte: new Date() }
    }
  });
}
