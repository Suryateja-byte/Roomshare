/**
 * Canonical publish state machine values (master-plan §9.4).
 *
 * Stored as TEXT in the database with a CHECK constraint on listing_inventories.
 * The same set of values is referenced by the outbox drain worker and projection
 * rebuild functions.
 */

export const PUBLISH_STATES = [
  "DRAFT",
  "PENDING_GEOCODE",
  "PENDING_PROJECTION",
  "PENDING_EMBEDDING",
  "PUBLISHED",
  "STALE_PUBLISHED",
  "PAUSED",
  "SUPPRESSED",
  "ARCHIVED",
] as const;

export type PublishState = (typeof PUBLISH_STATES)[number];

/**
 * Returns true if `s` represents a live-visible published state.
 * Only PUBLISHED and STALE_PUBLISHED are visible to search consumers.
 */
export function isPublishedStatus(s: string): s is "PUBLISHED" | "STALE_PUBLISHED" {
  return s === "PUBLISHED" || s === "STALE_PUBLISHED";
}

/**
 * Returns true if `s` represents a hidden/suppressed state.
 * Hidden listings are removed from all public projections.
 */
export function isHiddenStatus(s: string): s is "PAUSED" | "SUPPRESSED" | "ARCHIVED" {
  return s === "PAUSED" || s === "SUPPRESSED" || s === "ARCHIVED";
}

/**
 * Returns true if `s` represents a pending / in-flight state.
 * Pending listings are not yet visible but are being processed.
 */
export function isPendingStatus(
  s: string
): s is "PENDING_GEOCODE" | "PENDING_PROJECTION" | "PENDING_EMBEDDING" {
  return (
    s === "PENDING_GEOCODE" ||
    s === "PENDING_PROJECTION" ||
    s === "PENDING_EMBEDDING"
  );
}
