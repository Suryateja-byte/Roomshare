/**
 * SearchDoc Dirty Flag Helpers
 *
 * Marks listings as dirty when they change, triggering SearchDoc refresh
 * on the next cron run. Uses INSERT ON CONFLICT for idempotency.
 *
 * Call markListingDirty() after:
 * - Listing create/update/delete
 * - Status changes
 * - View count changes (affects recommended_score)
 * - Review create/update/delete (affects avg_rating)
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { features } from "@/lib/env";

type DirtyReason =
  | "listing_created"
  | "listing_updated"
  | "status_changed"
  | "view_count"
  | "review_changed";

/**
 * Mark a single listing as dirty for SearchDoc refresh.
 * Idempotent - safe to call multiple times for the same listing.
 *
 * This is fire-and-forget - we don't want to fail mutations
 * if the dirty flag fails to write.
 */
export async function markListingDirty(
  listingId: string,
  reason: DirtyReason,
): Promise<void> {
  if (!features.searchDoc) return;

  try {
    await prisma.$executeRaw`
      INSERT INTO listing_search_doc_dirty (listing_id, reason, marked_at)
      VALUES (${listingId}, ${reason}, NOW())
      ON CONFLICT (listing_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        marked_at = NOW()
    `;
  } catch (error) {
    // Log but don't fail - dirty marking is best-effort
    // The next full backfill will catch any missed updates
    logger.sync.error("[SearchDoc] Failed to mark listing dirty", {
      listingId: listingId.slice(0, 8) + "...",
      reason,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Mark multiple listings as dirty in a single query.
 * Used when a batch of listings need refreshing (e.g., bulk status update).
 */
export async function markListingsDirty(
  listingIds: string[],
  reason: DirtyReason,
): Promise<void> {
  if (listingIds.length === 0) return;
  if (!features.searchDoc) return;

  try {
    await prisma.$executeRaw`
      INSERT INTO listing_search_doc_dirty (listing_id, reason, marked_at)
      SELECT unnest(${listingIds}::text[]), ${reason}, NOW()
      ON CONFLICT (listing_id) DO UPDATE SET
        reason = EXCLUDED.reason,
        marked_at = NOW()
    `;
  } catch (error) {
    logger.sync.error("[SearchDoc] Failed to mark listings dirty", {
      count: listingIds.length,
      reason,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
