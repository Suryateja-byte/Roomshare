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
  | "CONFIRMED_STAY_REQUIRED";

type BlockRelationship = {
  blockerId: string;
  blockedId: string;
};

function withContactDisabledReason<
  T extends {
    canContact: boolean;
    contactDisabledReason: ContactDisabledReason | null;
  },
>(contract: T, reason: ContactDisabledReason): T {
  return {
    ...contract,
    canContact: false,
    contactDisabledReason: reason,
  };
}

function applyAuthenticatedContactRestrictions<
  T extends {
    canContact: boolean;
    contactDisabledReason: ContactDisabledReason | null;
  },
>(options: {
  contract: T;
  listing:
    | {
        ownerId: string;
        owner?: { isSuspended: boolean } | null;
      }
    | null;
  viewerId: string;
  isOwner: boolean;
  isEmailVerified: boolean;
  viewerIsSuspended: boolean;
  blockRelationships: BlockRelationship[];
}): T {
  const {
    contract,
    listing,
    viewerId,
    isOwner,
    isEmailVerified,
    viewerIsSuspended,
    blockRelationships,
  } = options;

  if (
    !listing ||
    isOwner ||
    !isEmailVerified ||
    contract.contactDisabledReason !== null
  ) {
    return contract;
  }

  if (viewerIsSuspended) {
    return withContactDisabledReason(contract, "VIEWER_SUSPENDED");
  }

  if (listing.owner?.isSuspended) {
    return withContactDisabledReason(contract, "HOST_SUSPENDED");
  }

  const viewerBlocksHost = blockRelationships.some(
    (relationship) =>
      relationship.blockerId === viewerId &&
      relationship.blockedId === listing.ownerId
  );
  if (viewerBlocksHost) {
    return withContactDisabledReason(contract, "VIEWER_BLOCKED_HOST");
  }

  const hostBlocksViewer = blockRelationships.some(
    (relationship) =>
      relationship.blockerId === listing.ownerId &&
      relationship.blockedId === viewerId
  );
  if (hostBlocksViewer) {
    return withContactDisabledReason(contract, "HOST_BLOCKED_VIEWER");
  }

  return contract;
}

function buildReviewEligibility(options: {
  isLoggedIn: boolean;
  isOwner: boolean;
  isEmailVerified: boolean;
  hasConfirmedStay: boolean;
  hasExistingReview: boolean;
  hasPriorConversation: boolean;
  hasExistingPrivateFeedback: boolean;
}) {
  let reason: ReviewEligibilityReason = "LOGIN_REQUIRED";

  if (options.isLoggedIn) {
    if (options.hasExistingReview) {
      reason = "ALREADY_REVIEWED";
    } else if (options.hasConfirmedStay) {
      reason = "ELIGIBLE";
    } else {
      reason = "CONFIRMED_STAY_REQUIRED";
    }
  }

  return {
    canPublicReview: options.isLoggedIn && options.hasConfirmedStay,
    hasLegacyAcceptedBooking: false,
    canLeavePrivateFeedback: canLeavePrivateFeedback({
      isLoggedIn: options.isLoggedIn,
      isOwner: options.isOwner,
      isEmailVerified: options.isEmailVerified,
      hasPriorConversation: options.hasPriorConversation,
      hasAcceptedBooking: false,
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
      availableSlots: true,
      totalSlots: true,
      openSlots: true,
      moveInDate: true,
      availableUntil: true,
      minStayMonths: true,
      lastConfirmedAt: true,
      statusReason: true,
      physicalUnitId: true,
      owner: {
        select: {
          isSuspended: true,
        },
      },
    },
  });

  const isOwner = !!session?.user?.id && listing?.ownerId === session.user.id;
  const isEmailVerified = !!session?.user?.emailVerified;
  const needsMigrationReview = false;
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
        hasConfirmedStay: false,
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
      conversationExists,
      existingPrivateFeedback,
      paywallSummary,
      viewerAccount,
      blockRelationships,
    ] = await Promise.all([
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
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { isSuspended: true },
        }),
        !isOwner && listing
          ? prisma.blockedUser.findMany({
              where: {
                OR: [
                  {
                    blockerId: session.user.id,
                    blockedId: listing.ownerId,
                  },
                  {
                    blockerId: listing.ownerId,
                    blockedId: session.user.id,
                  },
                ],
              },
              select: {
                blockerId: true,
                blockedId: true,
              },
            })
          : Promise.resolve([] as BlockRelationship[]),
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
    const restrictedViewerContract = applyAuthenticatedContactRestrictions({
      contract: baseViewerContract,
      listing,
      viewerId: session.user.id,
      isOwner,
      isEmailVerified,
      viewerIsSuspended: viewerAccount?.isSuspended === true,
      blockRelationships,
    });

    const viewerContract =
      paywallSummary &&
      features.contactPaywallEnforcement &&
      !isOwner &&
      restrictedViewerContract.primaryCta === "CONTACT_HOST" &&
      restrictedViewerContract.canContact &&
      paywallSummary.requiresPurchase
        ? {
            ...restrictedViewerContract,
            canContact: false,
            contactDisabledReason: "PAYWALL_REQUIRED" as ContactDisabledReason,
          }
        : restrictedViewerContract;

    const response = NextResponse.json({
      isLoggedIn: true,
      hasBookingHistory: false,
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
        hasConfirmedStay: false,
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
          hasConfirmedStay: false,
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
