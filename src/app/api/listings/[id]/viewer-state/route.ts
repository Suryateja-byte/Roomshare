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
  ACTIVE_REPORT_STATUSES,
  canLeavePrivateFeedback,
} from "@/lib/reports/private-feedback";
import {
  type ResolvedPublicAvailability,
} from "@/lib/search/public-availability";
import {
  buildPrivacyFirstViewerContract,
  type ContactDisabledReason,
} from "@/lib/listings/public-contact-contract";
import {
  evaluateMessageStartPaywall,
  type PaywallSummary,
} from "@/lib/payments/contact-paywall";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ReviewEligibilityReason =
  | "LOGIN_REQUIRED"
  | "ELIGIBLE"
  | "ALREADY_REVIEWED"
  | "ACCEPTED_BOOKING_REQUIRED";

function buildReviewEligibility(options: {
  isLoggedIn: boolean;
  isOwner: boolean;
  isEmailVerified: boolean;
  hasAcceptedBooking: boolean;
  hasExistingReview: boolean;
  hasPriorConversation: boolean;
  hasExistingPrivateFeedback: boolean;
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
    canLeavePrivateFeedback: canLeavePrivateFeedback({
      isLoggedIn: options.isLoggedIn,
      isOwner: options.isOwner,
      isEmailVerified: options.isEmailVerified,
      hasPriorConversation: options.hasPriorConversation,
      hasAcceptedBooking: options.hasAcceptedBooking,
      hasExistingPrivateFeedback: options.hasExistingPrivateFeedback,
    }),
    reason,
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
      physicalUnitId: true,
    },
  });

  const isOwner = !!session?.user?.id && listing?.ownerId === session.user.id;
  const isEmailVerified = !!session?.user?.emailVerified;
  const needsMigrationReview = listing?.needsMigrationReview === true;
  const paywallSummaryPromise = listing
    ? evaluateMessageStartPaywall({
        userId: session?.user?.id ?? null,
        physicalUnitId: listing.physicalUnitId,
      }).then((evaluation) => evaluation.summary)
    : Promise.resolve<PaywallSummary | null>(null);

  if (!session?.user?.id) {
    const paywallSummary = await paywallSummaryPromise;
    const rawViewerContract = buildPrivacyFirstViewerContract({
      isLoggedIn: false,
      isOwner: false,
      isEmailVerified: false,
      listing,
    });
    const {
      publicAvailability: viewerPublicAvailability,
      availabilityGateReason: _availabilityGateReason,
      ...viewerContract
    } = rawViewerContract as typeof rawViewerContract & {
      publicAvailability?: ResolvedPublicAvailability | null;
      availabilityGateReason?: unknown;
    };
    const response = NextResponse.json({
      isLoggedIn: false,
      hasBookingHistory: false,
      existingReview: null,
      ...viewerContract,
      publicAvailability: viewerPublicAvailability,
      paywallSummary,
      needsMigrationReview,
      reviewEligibility: buildReviewEligibility({
        isLoggedIn: false,
        isOwner: false,
        isEmailVerified: false,
        hasAcceptedBooking: false,
        hasExistingReview: false,
        hasPriorConversation: false,
        hasExistingPrivateFeedback: false,
      }),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  try {
    const [
      existingReview,
      bookingExists,
      conversationExists,
      existingPrivateFeedback,
      paywallSummary,
    ] =
      await Promise.all([
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
        features.privateFeedback && !isOwner && listing
          ? prisma.conversation.findFirst({
              where: {
                listingId: id,
                AND: [
                  { participants: { some: { id: session.user.id } } },
                  { participants: { some: { id: listing.ownerId } } },
                ],
                messages: { some: { senderId: session.user.id } },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
        features.privateFeedback && !isOwner && listing
          ? prisma.report.findFirst({
              where: {
                listingId: id,
                reporterId: session.user.id,
                kind: "PRIVATE_FEEDBACK",
                status: { in: [...ACTIVE_REPORT_STATUSES] },
              },
              select: { id: true },
            })
          : Promise.resolve(null),
        paywallSummaryPromise,
      ]);

    const rawViewerContract = buildPrivacyFirstViewerContract({
      isLoggedIn: true,
      isOwner,
      isEmailVerified,
      listing,
    });
    const {
      publicAvailability: viewerPublicAvailability,
      availabilityGateReason: _availabilityGateReason,
      ...baseViewerContract
    } = rawViewerContract as typeof rawViewerContract & {
      publicAvailability?: ResolvedPublicAvailability | null;
      availabilityGateReason?: unknown;
    };
    const viewerContract =
      paywallSummary &&
      features.contactPaywallEnforcement &&
      !isOwner &&
      baseViewerContract.primaryCta === "CONTACT_HOST" &&
      baseViewerContract.canContact &&
      paywallSummary.requiresPurchase
        ? {
            ...baseViewerContract,
            canContact: false,
            contactDisabledReason: "PAYWALL_REQUIRED" as ContactDisabledReason,
          }
        : baseViewerContract;

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
      publicAvailability: viewerPublicAvailability,
      paywallSummary,
      needsMigrationReview,
      reviewEligibility: buildReviewEligibility({
        isLoggedIn: true,
        isOwner,
        isEmailVerified,
        hasAcceptedBooking: !!bookingExists,
        hasExistingReview: !!existingReview,
        hasPriorConversation: !!conversationExists,
        hasExistingPrivateFeedback: !!existingPrivateFeedback,
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

    const paywallSummary = await paywallSummaryPromise.catch(() => null);
    const rawViewerContract = buildPrivacyFirstViewerContract({
      isLoggedIn: true,
      isOwner,
      isEmailVerified,
      listing,
    });
    const {
      publicAvailability: viewerPublicAvailability,
      availabilityGateReason: _availabilityGateReason,
      ...viewerContract
    } = rawViewerContract as typeof rawViewerContract & {
      publicAvailability?: ResolvedPublicAvailability | null;
      availabilityGateReason?: unknown;
    };
    const fallbackViewerContract =
      paywallSummary &&
      features.contactPaywallEnforcement &&
      !isOwner &&
      viewerContract.primaryCta === "CONTACT_HOST" &&
      viewerContract.canContact &&
      paywallSummary.requiresPurchase
        ? {
            ...viewerContract,
            canContact: false,
            contactDisabledReason:
              "PAYWALL_REQUIRED" as ContactDisabledReason,
          }
        : viewerContract;

    return NextResponse.json(
      {
        isLoggedIn: true,
        hasBookingHistory: false,
        existingReview: null,
        ...fallbackViewerContract,
        publicAvailability: viewerPublicAvailability,
        paywallSummary,
        needsMigrationReview,
        reviewEligibility: buildReviewEligibility({
          isLoggedIn: true,
          isOwner,
          isEmailVerified,
          hasAcceptedBooking: false,
          hasExistingReview: false,
          hasPriorConversation: false,
          hasExistingPrivateFeedback: false,
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
