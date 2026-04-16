// Viewer-state contract:
// - `canBook` and `canHold` are permanent-false compatibility fields under
//   contact-first. They remain in the response so older client bundles don't
//   crash; `bookingDisabledReason` is the explanation channel for why booking
//   UI should not render. New clients should rely on `primaryCta`,
//   `canContact`, and `publicAvailability` instead.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import {
  resolvePublicAvailability,
  type ResolvedPublicAvailability,
} from "@/lib/search/public-availability";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReviewEligibilityReason =
  | "LOGIN_REQUIRED"
  | "ELIGIBLE"
  | "ALREADY_REVIEWED"
  | "ACCEPTED_BOOKING_REQUIRED";

type PrimaryCta =
  | "EDIT_LISTING"
  | "CONTACT_HOST"
  | "LOGIN_TO_MESSAGE"
  | "VERIFY_EMAIL_TO_MESSAGE";

type AvailabilitySource = "LEGACY_BOOKING" | "HOST_MANAGED";

type BookingDisabledReason =
  | "CONTACT_ONLY"
  | "LOGIN_REQUIRED"
  | "EMAIL_VERIFICATION_REQUIRED"
  | "OWNER_VIEW"
  | "LISTING_UNAVAILABLE"
  | null;

function buildReviewEligibility(options: {
  isLoggedIn: boolean;
  hasAcceptedBooking: boolean;
  hasExistingReview: boolean;
}) {
  let reason: ReviewEligibilityReason = "LOGIN_REQUIRED";

  if (options.isLoggedIn) {
    if (options.hasExistingReview) {
      reason = "ALREADY_REVIEWED";
    } else if (options.hasAcceptedBooking) {
      reason = "ELIGIBLE";
    } else {
      reason = "ACCEPTED_BOOKING_REQUIRED";
    }
  }

  return {
    canPublicReview: options.isLoggedIn && options.hasAcceptedBooking,
    hasLegacyAcceptedBooking: options.hasAcceptedBooking,
    canLeavePrivateFeedback: false,
    reason,
  };
}

function buildViewerContract(options: {
  isLoggedIn: boolean;
  isOwner: boolean;
  isEmailVerified: boolean;
  isListingPubliclyAvailable: boolean;
  isListingSearchEligible: boolean;
  availabilitySource: AvailabilitySource;
}): {
  primaryCta: PrimaryCta;
  canContact: boolean;
  availabilitySource: AvailabilitySource;
  canBook: boolean;
  canHold: boolean;
  bookingDisabledReason: BookingDisabledReason;
} {
  const primaryCta: PrimaryCta = options.isOwner
    ? "EDIT_LISTING"
    : !options.isLoggedIn
      ? "LOGIN_TO_MESSAGE"
      : !options.isEmailVerified
        ? "VERIFY_EMAIL_TO_MESSAGE"
        : "CONTACT_HOST";

  const canContact =
    !options.isOwner &&
    options.isLoggedIn &&
    options.isEmailVerified &&
    options.isListingSearchEligible;

  const canBook =
    options.availabilitySource !== "HOST_MANAGED" &&
    !features.contactFirstListings &&
    !options.isOwner &&
    options.isLoggedIn &&
    options.isEmailVerified &&
    options.isListingPubliclyAvailable;

  const canHold = canBook && features.softHoldsEnabled;

  let bookingDisabledReason: BookingDisabledReason = null;
  if (!canBook) {
    if (options.availabilitySource === "HOST_MANAGED") {
      bookingDisabledReason =
        options.isListingPubliclyAvailable && options.isListingSearchEligible
        ? "CONTACT_ONLY"
        : "LISTING_UNAVAILABLE";
    } else if (features.contactFirstListings) {
      bookingDisabledReason = "CONTACT_ONLY";
    } else if (options.isOwner) {
      bookingDisabledReason = "OWNER_VIEW";
    } else if (!options.isListingPubliclyAvailable) {
      bookingDisabledReason = "LISTING_UNAVAILABLE";
    } else if (!options.isLoggedIn) {
      bookingDisabledReason = "LOGIN_REQUIRED";
    } else if (!options.isEmailVerified) {
      bookingDisabledReason = "EMAIL_VERIFICATION_REQUIRED";
    }
  }

  return {
    primaryCta,
    canContact,
    availabilitySource: options.availabilitySource,
    canBook,
    canHold,
    bookingDisabledReason,
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  // SEC-007 FIX: Rate limit to prevent enumeration/abuse
  const rateLimitResponse = await withRateLimit(request, {
    type: "viewerState",
  });
  if (rateLimitResponse) return rateLimitResponse;
  const { id } = await params;
  const session = await auth();

  const listing = await prisma.listing.findUnique({
    where: { id },
    select: {
      ownerId: true,
      status: true,
      availabilitySource: true,
      availableSlots: true,
      totalSlots: true,
      openSlots: true,
      moveInDate: true,
      availableUntil: true,
      minStayMonths: true,
      lastConfirmedAt: true,
      statusReason: true,
      needsMigrationReview: true,
    },
  });

  const isOwner = !!session?.user?.id && listing?.ownerId === session.user.id;
  const isEmailVerified = !!session?.user?.emailVerified;
  const resolvedAvailability: ResolvedPublicAvailability | null = listing
    ? resolvePublicAvailability(listing)
    : null;
  const availabilitySource: AvailabilitySource =
    resolvedAvailability?.availabilitySource ?? "LEGACY_BOOKING";
  const isListingPubliclyAvailable =
    resolvedAvailability?.isPubliclyAvailable ?? false;
  const isListingSearchEligible = resolvedAvailability?.searchEligible ?? false;
  const needsMigrationReview = listing?.needsMigrationReview === true;
  const publicAvailability: ResolvedPublicAvailability | null =
    resolvedAvailability;

  if (!session?.user?.id) {
    const viewerContract = buildViewerContract({
      isLoggedIn: false,
      isOwner: false,
      isEmailVerified: false,
      isListingPubliclyAvailable,
      isListingSearchEligible,
      availabilitySource,
    });
    const response = NextResponse.json({
      isLoggedIn: false,
      hasBookingHistory: false,
      existingReview: null,
      ...viewerContract,
      publicAvailability,
      needsMigrationReview,
      reviewEligibility: buildReviewEligibility({
        isLoggedIn: false,
        hasAcceptedBooking: false,
        hasExistingReview: false,
      }),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  try {
    const [existingReview, bookingExists] = await Promise.all([
      prisma.review.findFirst({
        where: {
          listingId: id,
          authorId: session.user.id,
        },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      }),
      prisma.booking.findFirst({
        where: {
          listingId: id,
          tenantId: session.user.id,
          status: "ACCEPTED",
        },
        select: {
          id: true,
        },
      }),
    ]);

    const viewerContract = buildViewerContract({
      isLoggedIn: true,
      isOwner,
      isEmailVerified,
      isListingPubliclyAvailable,
      isListingSearchEligible,
      availabilitySource,
    });

    const response = NextResponse.json({
      isLoggedIn: true,
      hasBookingHistory: !!bookingExists,
      existingReview: existingReview
        ? {
            id: existingReview.id,
            rating: existingReview.rating,
            comment: existingReview.comment,
            createdAt: existingReview.createdAt.toISOString(),
          }
        : null,
      ...viewerContract,
      publicAvailability,
      needsMigrationReview,
      reviewEligibility: buildReviewEligibility({
        isLoggedIn: true,
        hasAcceptedBooking: !!bookingExists,
        hasExistingReview: !!existingReview,
      }),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    logger.sync.warn("Failed to load listing viewer state", {
      listingId: id,
      userId: session.user.id,
      error: sanitizeErrorMessage(error),
    });

    return NextResponse.json(
      {
        isLoggedIn: true,
        hasBookingHistory: false,
        existingReview: null,
        ...buildViewerContract({
          isLoggedIn: true,
          isOwner,
          isEmailVerified,
          isListingPubliclyAvailable,
          isListingSearchEligible,
          availabilitySource,
        }),
        publicAvailability,
        needsMigrationReview,
        reviewEligibility: buildReviewEligibility({
          isLoggedIn: true,
          hasAcceptedBooking: false,
          hasExistingReview: false,
        }),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    );
  }
}
