import type { ListingStatus } from "@prisma/client";
import {
  resolvePublicAvailability,
  type LegacyAvailabilitySnapshotLike,
  type PublicAvailabilitySource,
  type PublicAvailabilityListingInput,
  type ResolvedPublicAvailability,
} from "@/lib/search/public-availability";

export type ContactDisabledReason =
  | "LOGIN_REQUIRED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "OWNER_VIEW"
  | "LISTING_UNAVAILABLE"
  | "MIGRATION_REVIEW"
  | "MODERATION_LOCKED"
  | "PAYWALL_REQUIRED";

export type ListingAvailabilityGateReason =
  | "LISTING_UNAVAILABLE"
  | "MIGRATION_REVIEW"
  | "MODERATION_LOCKED";

export type PrimaryCta =
  | "EDIT_LISTING"
  | "CONTACT_HOST"
  | "LOGIN_TO_MESSAGE"
  | "VERIFY_EMAIL_TO_MESSAGE";

export type ViewerBookingDisabledReason =
  | "CONTACT_ONLY"
  | "LOGIN_REQUIRED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "OWNER_VIEW"
  | "LISTING_UNAVAILABLE"
  | null;

export interface PublicContactListingInput
  extends PublicAvailabilityListingInput {
  ownerId?: string | null;
  needsMigrationReview?: boolean | null;
  status?: ListingStatus | null;
}

export interface PublicListingVisibilityState {
  availabilitySource: PublicAvailabilitySource;
  publicAvailability: ResolvedPublicAvailability | null;
  isSearchEligible: boolean;
  isPubliclyVisible: boolean;
  availabilityGateReason: ListingAvailabilityGateReason | null;
}

export interface ViewerContactContract {
  primaryCta: PrimaryCta;
  canContact: boolean;
  contactDisabledReason: ContactDisabledReason | null;
  availabilitySource: PublicAvailabilitySource;
  canBook: false;
  canHold: false;
  bookingDisabledReason: ViewerBookingDisabledReason;
}

export interface ViewerContactFields {
  primaryCta: PrimaryCta;
  canContact: boolean;
  contactDisabledReason: ContactDisabledReason | null;
  availabilitySource: PublicAvailabilitySource;
}

const MODERATION_LOCKED_STATUS_REASONS = new Set(["ADMIN_PAUSED", "SUPPRESSED"]);

export const LISTING_UNAVAILABLE_MESSAGE =
  "This listing is not available for new messages right now.";
export const MIGRATION_REVIEW_MESSAGE =
  "This listing is temporarily unavailable.";
export const MODERATION_LOCKED_MESSAGE =
  "This listing is temporarily unavailable while it is under review.";

export function isModerationLockedStatusReason(
  statusReason: string | null | undefined
): boolean {
  if (!statusReason) {
    return false;
  }

  return MODERATION_LOCKED_STATUS_REASONS.has(statusReason);
}

export function resolveListingAvailabilityGateReason(
  listing: Pick<
    PublicContactListingInput,
    "needsMigrationReview" | "statusReason"
  >,
  isSearchEligible: boolean
): ListingAvailabilityGateReason | null {
  if (listing.statusReason === "MIGRATION_REVIEW") {
    return "MIGRATION_REVIEW";
  }

  if (isModerationLockedStatusReason(listing.statusReason)) {
    return "MODERATION_LOCKED";
  }

  if (!isSearchEligible) {
    return "LISTING_UNAVAILABLE";
  }

  return null;
}

export function resolvePublicListingVisibilityState<
  T extends PublicContactListingInput,
>(
  listing: T | null | undefined,
  options: {
    legacySnapshot?: LegacyAvailabilitySnapshotLike | null;
    now?: Date;
  } = {}
): PublicListingVisibilityState {
  if (!listing) {
    return {
      availabilitySource: "HOST_MANAGED",
      publicAvailability: null,
      isSearchEligible: false,
      isPubliclyVisible: false,
      availabilityGateReason: "LISTING_UNAVAILABLE",
    };
  }

  const publicAvailability = resolvePublicAvailability(listing, {
    legacySnapshot: options.legacySnapshot,
    now: options.now,
  });
  const isSearchEligible = isEligibleForPublicSearch({
    needsMigrationReview: listing.needsMigrationReview,
    statusReason: listing.statusReason,
    publicAvailability,
  });
  const availabilityGateReason = resolveListingAvailabilityGateReason(
    listing,
    isSearchEligible
  );

  return {
    availabilitySource: publicAvailability.availabilitySource,
    publicAvailability,
    isSearchEligible,
    isPubliclyVisible: availabilityGateReason === null,
    availabilityGateReason,
  };
}

function toCompatibilityBookingDisabledReason(
  reason: ContactDisabledReason | null
): ViewerBookingDisabledReason {
  if (reason === null) {
    return "CONTACT_ONLY";
  }

  if (
    reason === "LOGIN_REQUIRED" ||
    reason === "EMAIL_VERIFICATION_REQUIRED" ||
    reason === "OWNER_VIEW"
  ) {
    return reason;
  }

  if (reason === "PAYWALL_REQUIRED") {
    return "CONTACT_ONLY";
  }

  return "LISTING_UNAVAILABLE";
}

function isEligibleForPublicSearch(input: {
  needsMigrationReview?: boolean | null;
  statusReason?: string | null;
  publicAvailability: ResolvedPublicAvailability;
}): boolean {
  return (
    input.publicAvailability.searchEligible &&
    input.needsMigrationReview !== true &&
    input.statusReason !== "MIGRATION_REVIEW"
  );
}

export function buildPrivacyFirstViewerContract(options: {
  isLoggedIn: boolean;
  isOwner: boolean;
  isEmailVerified: boolean;
  listing: PublicContactListingInput | null | undefined;
  legacySnapshot?: LegacyAvailabilitySnapshotLike | null;
}): ViewerContactContract & {
  publicAvailability: ResolvedPublicAvailability | null;
  availabilityGateReason: ListingAvailabilityGateReason | null;
} {
  const visibility = resolvePublicListingVisibilityState(options.listing, {
    legacySnapshot: options.legacySnapshot,
  });

  const primaryCta: PrimaryCta = options.isOwner
    ? "EDIT_LISTING"
    : !options.isLoggedIn
      ? "LOGIN_TO_MESSAGE"
      : !options.isEmailVerified
        ? "VERIFY_EMAIL_TO_MESSAGE"
        : "CONTACT_HOST";

  const contactDisabledReason: ContactDisabledReason | null = options.isOwner
    ? "OWNER_VIEW"
    : !options.isLoggedIn
      ? "LOGIN_REQUIRED"
      : !options.isEmailVerified
        ? "EMAIL_VERIFICATION_REQUIRED"
        : visibility.availabilityGateReason;

  return {
    primaryCta,
    canContact: contactDisabledReason === null,
    contactDisabledReason,
    availabilitySource: visibility.availabilitySource,
    canBook: false,
    canHold: false,
    bookingDisabledReason: toCompatibilityBookingDisabledReason(
      contactDisabledReason
    ),
    publicAvailability: visibility.publicAvailability,
    availabilityGateReason: visibility.availabilityGateReason,
  };
}

export function messageForAvailabilityGateReason(
  reason: ListingAvailabilityGateReason
): string {
  switch (reason) {
    case "MIGRATION_REVIEW":
      return MIGRATION_REVIEW_MESSAGE;
    case "MODERATION_LOCKED":
      return MODERATION_LOCKED_MESSAGE;
    case "LISTING_UNAVAILABLE":
    default:
      return LISTING_UNAVAILABLE_MESSAGE;
  }
}

export function coerceViewerContactFields(
  fallback: ViewerContactFields,
  input: Partial<ViewerContactFields>
): ViewerContactFields {
  const primaryCta: PrimaryCta =
    input.primaryCta === "EDIT_LISTING" ||
    input.primaryCta === "CONTACT_HOST" ||
    input.primaryCta === "LOGIN_TO_MESSAGE" ||
    input.primaryCta === "VERIFY_EMAIL_TO_MESSAGE"
      ? input.primaryCta
      : fallback.primaryCta;

  const contactDisabledReason: ContactDisabledReason | null =
    input.contactDisabledReason === "LOGIN_REQUIRED" ||
    input.contactDisabledReason === "EMAIL_VERIFICATION_REQUIRED" ||
    input.contactDisabledReason === "OWNER_VIEW" ||
    input.contactDisabledReason === "LISTING_UNAVAILABLE" ||
    input.contactDisabledReason === "MIGRATION_REVIEW" ||
    input.contactDisabledReason === "MODERATION_LOCKED" ||
    input.contactDisabledReason === "PAYWALL_REQUIRED" ||
    input.contactDisabledReason === null
      ? input.contactDisabledReason
      : fallback.contactDisabledReason;

  const availabilitySource: PublicAvailabilitySource =
    input.availabilitySource === "HOST_MANAGED" ||
    input.availabilitySource === "LEGACY_BOOKING"
      ? input.availabilitySource
      : fallback.availabilitySource;

  return {
    primaryCta,
    canContact:
      typeof input.canContact === "boolean"
        ? input.canContact
        : fallback.canContact,
    contactDisabledReason,
    availabilitySource,
  };
}
