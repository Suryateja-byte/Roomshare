import type { ListingStatus } from "@prisma/client";
import {
  LISTING_UNAVAILABLE_MESSAGE,
  MIGRATION_REVIEW_MESSAGE,
  MODERATION_LOCKED_MESSAGE,
  messageForAvailabilityGateReason,
  resolvePublicListingVisibilityState,
  type ListingAvailabilityGateReason,
  type PublicContactListingInput,
} from "@/lib/listings/public-contact-contract";

export type ContactableCheck<
  T extends { status: ListingStatus } & Partial<PublicContactListingInput>,
> =
  | { ok: true; listing: T }
  | {
      ok: false;
      code:
        | "LISTING_NOT_FOUND"
        | "LISTING_INACTIVE"
        | ListingAvailabilityGateReason;
      message: string;
    };

export {
  LISTING_UNAVAILABLE_MESSAGE,
  MIGRATION_REVIEW_MESSAGE,
  MODERATION_LOCKED_MESSAGE,
};

export const LISTING_INACTIVE_MESSAGE =
  "This listing is no longer active. New messages are paused.";
export const LISTING_NOT_FOUND_MESSAGE = "Listing not found";

export function evaluateListingContactable<
  T extends { status: ListingStatus } & Partial<PublicContactListingInput>,
>(listing: T | null | undefined): ContactableCheck<T> {
  if (!listing) {
    return {
      ok: false,
      code: "LISTING_NOT_FOUND",
      message: LISTING_NOT_FOUND_MESSAGE,
    };
  }

  const visibility = resolvePublicListingVisibilityState(listing);
  if (visibility.availabilityGateReason) {
    return {
      ok: false,
      code: visibility.availabilityGateReason,
      message: messageForAvailabilityGateReason(
        visibility.availabilityGateReason
      ),
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
