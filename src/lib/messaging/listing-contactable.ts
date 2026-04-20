import type { ListingStatus } from "@prisma/client";

export type ContactableCheck<T extends { status: ListingStatus }> =
  | { ok: true; listing: T }
  | {
      ok: false;
      code: "LISTING_NOT_FOUND" | "LISTING_INACTIVE";
      message: string;
    };

export const LISTING_INACTIVE_MESSAGE =
  "This listing is no longer active. New messages are paused.";
export const LISTING_NOT_FOUND_MESSAGE = "Listing not found";

export function evaluateListingContactable<
  T extends { status: ListingStatus },
>(listing: T | null | undefined): ContactableCheck<T> {
  if (!listing) {
    return {
      ok: false,
      code: "LISTING_NOT_FOUND",
      message: LISTING_NOT_FOUND_MESSAGE,
    };
  }
  if (listing.status !== "ACTIVE") {
    return {
      ok: false,
      code: "LISTING_INACTIVE",
      message: LISTING_INACTIVE_MESSAGE,
    };
  }
  return { ok: true, listing };
}
