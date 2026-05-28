import { createHmac } from "crypto";
import { getPublicCacheSigningSecret } from "@/lib/public-cache/cache-policy";
import type {
  GroupContextPresentation,
  GroupSummary,
  ListingData,
  MapListingData,
  PublicSearchListing,
} from "@/lib/search-types";
import { toPublicCoordinates } from "@/lib/search/public-coordinates";
import {
  buildPublicAvailability,
  type PublicAvailability,
} from "@/lib/search/public-availability";

export const PUBLIC_GROUP_KEY_PREFIX = "pg1_";

type GroupMetadataInput = {
  groupKey?: string | null;
  groupSummary?: GroupSummary | null;
  groupContext?: GroupContextPresentation | null;
};

export type PublicGroupMetadata = {
  groupKey: string | null;
  groupSummary: GroupSummary | null;
  groupContext: GroupContextPresentation | null;
};

function toNonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function toPublicGroupKey(
  groupKey: string | null | undefined
): string | null {
  const rawGroupKey = toNonEmptyString(groupKey);
  if (!rawGroupKey) {
    return null;
  }
  if (rawGroupKey.startsWith(PUBLIC_GROUP_KEY_PREFIX)) {
    return rawGroupKey;
  }

  const digest = createHmac("sha256", getPublicCacheSigningSecret())
    .update(`search-public-group:${rawGroupKey}`)
    .digest("base64url")
    .slice(0, 24);

  return `${PUBLIC_GROUP_KEY_PREFIX}${digest}`;
}

function publicContextFallbackKey(
  groupContext: GroupContextPresentation
): string {
  return [
    "context",
    groupContext.siblingCount,
    groupContext.dateCount,
    groupContext.completeness,
    groupContext.secondaryLabel ?? "",
  ].join(":");
}

export function toPublicGroupMetadata(
  input: GroupMetadataInput
): PublicGroupMetadata {
  const publicGroupKey =
    toPublicGroupKey(input.groupKey) ??
    toPublicGroupKey(input.groupSummary?.groupKey) ??
    null;
  const summarySourceKey =
    input.groupSummary?.groupKey ??
    input.groupKey ??
    input.groupContext?.contextKey ??
    (input.groupSummary
      ? [
          "summary",
          input.groupSummary.siblingIds.join(","),
          input.groupSummary.availableFromDates.join(","),
          input.groupSummary.combinedOpenSlots,
          input.groupSummary.combinedTotalSlots,
        ].join(":")
      : null);

  const groupSummary = input.groupSummary
    ? {
        ...input.groupSummary,
        groupKey:
          toPublicGroupKey(summarySourceKey) ??
          publicGroupKey ??
          PUBLIC_GROUP_KEY_PREFIX,
        siblingIds: input.groupSummary.siblingIds.slice(),
        availableFromDates: input.groupSummary.availableFromDates.slice(),
        members: input.groupSummary.members?.map((member) => ({ ...member })),
        windows: input.groupSummary.windows?.map((window) => ({ ...window })),
      }
    : null;

  const groupContext = input.groupContext
    ? {
        ...input.groupContext,
        contextKey:
          toPublicGroupKey(input.groupContext.contextKey) ??
          toPublicGroupKey(publicContextFallbackKey(input.groupContext)) ??
          PUBLIC_GROUP_KEY_PREFIX,
      }
    : null;

  return {
    groupKey: publicGroupKey,
    groupSummary,
    groupContext,
  };
}

function normalizePublicAvailability(
  listing: ListingData | MapListingData
): PublicAvailability {
  return (
    listing.publicAvailability ??
    buildPublicAvailability({
      availabilitySource: listing.availabilitySource,
      openSlots: listing.openSlots,
      availableSlots: listing.availableSlots,
      totalSlots: listing.totalSlots,
      moveInDate: listing.moveInDate,
      availableUntil: listing.availableUntil,
      minStayMonths: listing.minStayMonths,
      lastConfirmedAt: listing.lastConfirmedAt,
    })
  );
}

export function toPublicSearchListing(
  listing: ListingData
): PublicSearchListing {
  const publicAvailability = normalizePublicAvailability(listing);
  const publicCoordinates = toPublicCoordinates(listing.location);
  const publicGroupMetadata = toPublicGroupMetadata(listing);

  return {
    id: listing.id,
    title: listing.title,
    description: "",
    price: listing.price,
    images: listing.images.slice(),
    availableSlots: publicAvailability.openSlots,
    totalSlots: publicAvailability.totalSlots,
    amenities: listing.amenities.slice(),
    houseRules: listing.houseRules.slice(),
    householdLanguages: listing.householdLanguages.slice(),
    primaryHomeLanguage: listing.primaryHomeLanguage,
    genderPreference: listing.genderPreference,
    householdGender: listing.householdGender,
    leaseDuration: listing.leaseDuration,
    roomType: listing.roomType,
    moveInDate: listing.moveInDate,
    location: {
      city: listing.location.city,
      state: listing.location.state,
      lat: publicCoordinates.lat,
      lng: publicCoordinates.lng,
    },
    publicAvailability,
    availabilitySource: publicAvailability.availabilitySource,
    openSlots: publicAvailability.openSlots,
    availableUntil: listing.availableUntil,
    minStayMonths: publicAvailability.minStayMonths,
    lastConfirmedAt: listing.lastConfirmedAt,
    status: listing.status,
    groupKey: publicGroupMetadata.groupKey,
    groupSummary: publicGroupMetadata.groupSummary,
    groupContext: publicGroupMetadata.groupContext,
    hostIdentityStatus: listing.hostIdentityStatus ?? "unknown",
    isNearMatch: listing.isNearMatch,
  };
}

export function toPublicSearchListings(
  listings: ListingData[]
): PublicSearchListing[] {
  return listings.map(toPublicSearchListing);
}

export function toPublicMapListing(listing: MapListingData): MapListingData {
  const publicCoordinates = toPublicCoordinates(listing.location);
  const publicGroupMetadata = toPublicGroupMetadata(listing);

  return {
    ...listing,
    location: {
      ...listing.location,
      lat: publicCoordinates.lat,
      lng: publicCoordinates.lng,
    },
    groupKey: publicGroupMetadata.groupKey,
    groupSummary: publicGroupMetadata.groupSummary,
    groupContext: publicGroupMetadata.groupContext,
    hostIdentityStatus: listing.hostIdentityStatus ?? "unknown",
    statusReason: null,
  };
}

export function toPublicMapListings(
  listings: MapListingData[]
): MapListingData[] {
  return listings.map(toPublicMapListing);
}
