/**
 * SearchDoc Dirty Flag Helpers
 *
 * Marks listings as dirty when they change, triggering SearchDoc refresh
 * on the next cron run. Uses INSERT ON CONFLICT for idempotency.
 *
 * Two variants:
 * - markListingDirty / markListingsDirty: post-transaction, fire-and-forget.
 *   Safe for best-effort cases (view counts, cron hold sweeps).
 * - markListingDirtyInTx / markListingsDirtyInTx: inside the source write
 *   transaction. The dirty mark rolls back with the enclosing tx on failure,
 *   and is durably committed alongside the source write on success. Prefer
 *   these for listing / status / admin mutations where a crash between
 *   tx commit and mark-dirty would leave the search doc silently stale.
 *
 * Call after:
 * - Listing create/update/delete
 * - Status changes
 * - View count changes (affects recommended_score)
 * - Review create/update/delete (affects avg_rating)
 */

import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { features } from "@/lib/env";

type DirtyReason =
  | "listing_created"
  | "listing_updated"
  | "listing_deleted"
  | "status_changed"
  | "view_count"
  | "review_changed"
  | "booking_hold_expired"
  | "reconcile_slots";

/**
 * Transaction client accepted by the in-tx dirty-mark helpers. Matches the
 * type passed to the callback of `prisma.$transaction(cb)`.
 */
export type DirtyMarkTxClient = Prisma.TransactionClient;

/**
 * Mark a single listing as dirty for SearchDoc refresh.
 * Idempotent - safe to call multiple times for the same listing.
 *
 * This is fire-and-forget - we don't want to fail mutations
 * if the dirty flag fails to write.
 */
export async function markListingDirty(
  listingId: string,
  reason: DirtyReason
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
      error: sanitizeErrorMessage(error),
    });
  }
}

/**
 * Mark multiple listings as dirty in a single query.
 * Used when a batch of listings need refreshing (e.g., bulk status update).
 */
export async function markListingsDirty(
  listingIds: string[],
  reason: DirtyReason
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
      error: sanitizeErrorMessage(error),
    });
  }
}

/**
 * In-transaction variant of markListingDirty. Runs the INSERT on the supplied
 * transaction client so the dirty mark is atomic with the caller's source
 * write. If the enclosing tx rolls back, the dirty mark rolls back too; if the
 * process crashes after commit, the dirty row is already durable and the cron
 * backstop will repair the search doc on its next pass.
 *
 * Does NOT swallow errors — throws out so the enclosing transaction can roll
 * back. Callers that prefer best-effort semantics should use `markListingDirty`
 * (post-transaction) instead.
 */
export async function markListingDirtyInTx(
  tx: DirtyMarkTxClient,
  listingId: string,
  reason: DirtyReason
): Promise<void> {
  if (!features.searchDoc) return;

  await tx.$executeRaw`
    INSERT INTO listing_search_doc_dirty (listing_id, reason, marked_at)
    VALUES (${listingId}, ${reason}, NOW())
    ON CONFLICT (listing_id) DO UPDATE SET
      reason = EXCLUDED.reason,
      marked_at = NOW()
  `;
}

/**
 * In-transaction variant of markListingsDirty. Same atomicity guarantees as
 * markListingDirtyInTx: the batch INSERT runs on the supplied tx client and
 * rolls back with the enclosing transaction on failure. Throws on error so the
 * caller can roll back.
 */
export async function markListingsDirtyInTx(
  tx: DirtyMarkTxClient,
  listingIds: string[],
  reason: DirtyReason
): Promise<void> {
  if (listingIds.length === 0) return;
  if (!features.searchDoc) return;

  await tx.$executeRaw`
    INSERT INTO listing_search_doc_dirty (listing_id, reason, marked_at)
    SELECT unnest(${listingIds}::text[]), ${reason}, NOW()
    ON CONFLICT (listing_id) DO UPDATE SET
      reason = EXCLUDED.reason,
      marked_at = NOW()
  `;
}
