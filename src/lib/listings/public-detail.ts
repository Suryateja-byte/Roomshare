import "server-only";

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePublicListingVisibilityState } from "@/lib/listings/public-contact-contract";

export const publicListingDetailSelect = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  price: true,
  images: true,
  amenities: true,
  householdLanguages: true,
  totalSlots: true,
  availableSlots: true,
  openSlots: true,
  moveInDate: true,
  availableUntil: true,
  minStayMonths: true,
  lastConfirmedAt: true,
  availabilitySource: true,
  needsMigrationReview: true,
  statusReason: true,
  status: true,
  viewCount: true,
  version: true,
  bookingMode: true,
  genderPreference: true,
  householdGender: true,
  owner: {
    select: {
      id: true,
      name: true,
      image: true,
      bio: true,
      isVerified: true,
      createdAt: true,
    },
  },
  location: {
    select: {
      city: true,
      state: true,
    },
  },
} satisfies Prisma.ListingSelect;

export type PublicListingDetailRecord = Prisma.ListingGetPayload<{
  select: typeof publicListingDetailSelect;
}>;

export interface PublicListingDetailViewer {
  userId?: string | null;
  isAdmin?: boolean;
}

export interface PublicListingDetailResult {
  listing: PublicListingDetailRecord;
  publicAvailability: ReturnType<
    typeof resolvePublicListingVisibilityState
  >["publicAvailability"];
  isPubliclyVisible: boolean;
  isOwner: boolean;
  isAdmin: boolean;
}

const getPublicListingDetailCached = cache(
  async (
    listingId: string,
    viewerUserId: string | null,
    isAdmin: boolean
  ): Promise<PublicListingDetailResult | null> => {
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: publicListingDetailSelect,
    });

    if (!listing) {
      return null;
    }

    const isOwner = viewerUserId === listing.ownerId;
    const visibility = resolvePublicListingVisibilityState(listing);

    if (!visibility.isPubliclyVisible && !isOwner && !isAdmin) {
      return null;
    }

    return {
      listing,
      publicAvailability: visibility.publicAvailability,
      isPubliclyVisible: visibility.isPubliclyVisible,
      isOwner,
      isAdmin,
    };
  }
);

export function getPublicListingDetail(
  listingId: string,
  viewer: PublicListingDetailViewer = {}
) {
  return getPublicListingDetailCached(
    listingId,
    viewer.userId ?? null,
    viewer.isAdmin === true
  );
}
