import { prisma } from '@/lib/prisma';

export interface ListingAvailability {
  availableSlots: number;
  effectiveAvailable: number;
  ghostHolds: number;
}

/**
 * Get listing availability accounting for ghost holds (expired-but-unswept HELD bookings).
 *
 * - availableSlots: current DB value (may be stale if sweeper hasn't run)
 * - effectiveAvailable: availableSlots + ghost holds that will be restored on next sweep
 * - ghostHolds: count of slots held by expired holds awaiting sweeper cleanup
 */
export async function getListingAvailability(listingId: string): Promise<ListingAvailability | null> {
  const [result] = await prisma.$queryRaw<Array<{
    availableSlots: number;
    effectiveAvailable: number;
    ghostHolds: number;
  }>>`
    SELECT
      l."availableSlots"::int AS "availableSlots",
      (l."availableSlots" + COALESCE(gh.ghost_slots, 0))::int AS "effectiveAvailable",
      COALESCE(gh.ghost_slots, 0)::int AS "ghostHolds"
    FROM "Listing" l
    LEFT JOIN (
      SELECT "listingId", SUM("slotsRequested")::int AS ghost_slots
      FROM "Booking"
      WHERE status = 'HELD' AND "heldUntil" < NOW()
      GROUP BY "listingId"
    ) gh ON gh."listingId" = l.id
    WHERE l.id = ${listingId}
  `;
  return result || null;
}
