import type {
  GroupContextPresentation,
  GroupSummary,
  MapListingData,
} from "@/lib/search-types";
import { buildPublicAvailability } from "@/lib/search/public-availability";
import type { PublicAvailabilitySource } from "@/lib/search/public-availability";
import { toPublicCoordinates } from "@/lib/search/public-coordinates";

type MapListingInput = {
  id: string;
  title?: string | null;
  price?: unknown;
  availableSlots?: unknown;
  totalSlots?: unknown;
  images?: unknown;
  roomType?: unknown;
  moveInDate?: unknown;
  location?: {
    city?: unknown;
    state?: unknown;
    lat?: unknown;
    lng?: unknown;
  } | null;
  tier?: "primary" | "mini";
  avgRating?: unknown;
  reviewCount?: unknown;
  recommendedScore?: unknown;
  createdAt?: unknown;
  availabilitySource?: PublicAvailabilitySource;
  openSlots?: unknown;
  availableUntil?: unknown;
  minStayMonths?: unknown;
  lastConfirmedAt?: unknown;
  status?: unknown;
  statusReason?: unknown;
  publicAvailability?: MapListingData["publicAvailability"];
  groupKey?: unknown;
  groupSummary?: GroupSummary | null;
  groupContext?: GroupContextPresentation | null;
};

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : value != null && typeof value === "object"
          ? Number(value)
          : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeSlotCount(value: unknown, fallback = 0): number {
  return Math.max(0, Math.trunc(toFiniteNumber(value, fallback)));
}

function toSafeDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function toOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function hasValidCoordinateRange(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function sanitizeMapListing(
  listing: MapListingInput
): MapListingData | null {
  const lat = toFiniteNumber(listing.location?.lat, Number.NaN);
  const lng = toFiniteNumber(listing.location?.lng, Number.NaN);

  if (!hasValidCoordinateRange(lat, lng)) {
    return null;
  }
  const publicCoordinates = toPublicCoordinates({ lat, lng });

  const publicAvailability =
    listing.publicAvailability ??
    buildPublicAvailability({
      availabilitySource: listing.availabilitySource,
      openSlots:
        listing.openSlots == null ? null : toSafeSlotCount(listing.openSlots),
      availableSlots: toSafeSlotCount(listing.availableSlots),
      totalSlots: toSafeSlotCount(
        listing.totalSlots,
        toSafeSlotCount(listing.availableSlots)
      ),
      moveInDate: toSafeDate(listing.moveInDate),
      availableUntil: toSafeDate(listing.availableUntil),
      minStayMonths:
        listing.minStayMonths == null
          ? undefined
          : Math.max(1, toSafeSlotCount(listing.minStayMonths, 1)),
      lastConfirmedAt: toSafeDate(listing.lastConfirmedAt),
    });

  return {
    id: listing.id,
    title: listing.title?.trim() || "",
    price: Math.max(0, toFiniteNumber(listing.price, 0)),
    availableSlots: toSafeSlotCount(publicAvailability.openSlots),
    totalSlots: toSafeSlotCount(publicAvailability.totalSlots),
    images: Array.isArray(listing.images)
      ? listing.images.filter(
          (image): image is string => typeof image === "string"
        )
      : [],
    roomType: toOptionalTrimmedString(listing.roomType),
    moveInDate: toSafeDate(listing.moveInDate) ?? undefined,
    availabilitySource: publicAvailability.availabilitySource,
    openSlots: toSafeSlotCount(publicAvailability.openSlots),
    availableUntil: toSafeDate(publicAvailability.availableUntil),
    minStayMonths: Math.max(1, toSafeSlotCount(publicAvailability.minStayMonths, 1)),
    lastConfirmedAt: toSafeDate(publicAvailability.lastConfirmedAt),
    status: toOptionalTrimmedString(listing.status),
    statusReason: toOptionalTrimmedString(listing.statusReason) ?? null,
    groupKey: toOptionalTrimmedString(listing.groupKey) ?? null,
    groupSummary: listing.groupSummary ?? null,
    groupContext: listing.groupContext ?? null,
    location: {
      city: toOptionalTrimmedString(listing.location?.city),
      state: toOptionalTrimmedString(listing.location?.state),
      lat: publicCoordinates.lat,
      lng: publicCoordinates.lng,
    },
    publicAvailability,
    tier: listing.tier,
    avgRating: toFiniteNumber(listing.avgRating, 0),
    reviewCount: Math.max(
      0,
      Math.trunc(toFiniteNumber(listing.reviewCount, 0))
    ),
    recommendedScore:
      listing.recommendedScore != null
        ? Number.isFinite(toFiniteNumber(listing.recommendedScore, Number.NaN))
          ? toFiniteNumber(listing.recommendedScore, 0)
          : null
        : null,
    createdAt: toSafeDate(listing.createdAt),
  };
}

export function sanitizeMapListings(
  listings: MapListingInput[]
): MapListingData[] {
  return listings.reduce<MapListingData[]>((sanitized, listing) => {
    const safeListing = sanitizeMapListing(listing);
    if (safeListing) {
      sanitized.push(safeListing);
    }
    return sanitized;
  }, []);
}
