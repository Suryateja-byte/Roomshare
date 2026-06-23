import type { MapListingData } from "@/lib/data";
import { buildPublicAvailability } from "./public-availability";
import type { SearchV2FeatureProperties, SearchV2Map } from "./types";
import type {
  GroupContextPresentation,
  HostIdentityStatus,
} from "@/lib/search-types";
import { toPublicCoordinates } from "./public-coordinates";

const PUBLIC_GROUP_KEY_PREFIX = "pg1_";

type PartialMapFeatureProperties = Partial<
  Omit<SearchV2FeatureProperties, "publicAvailability" | "groupContext">
> & {
  publicAvailability?: unknown;
  groupContext?: unknown;
  totalSlots?: unknown;
  avgRating?: unknown;
  reviewCount?: unknown;
  recommendedScore?: unknown;
  createdAt?: unknown;
};

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeSlotCount(value: unknown, fallback = 0): number {
  return Math.max(0, Math.trunc(toFiniteNumber(value, fallback)));
}

function toSafeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toHostIdentityStatus(value: unknown): HostIdentityStatus {
  return value === "verified" || value === "unverified" ? value : "unknown";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isPublicGroupContext(
  groupContext: unknown
): groupContext is GroupContextPresentation {
  return (
    isRecord(groupContext) &&
    typeof groupContext.contextKey === "string" &&
    groupContext.contextKey.startsWith(PUBLIC_GROUP_KEY_PREFIX) &&
    typeof groupContext.siblingCount === "number" &&
    typeof groupContext.dateCount === "number" &&
    typeof groupContext.completeness === "string"
  );
}

function toMapPublicAvailability(properties: PartialMapFeatureProperties) {
  const publicAvailability = isRecord(properties.publicAvailability)
    ? properties.publicAvailability
    : null;

  const availableSlots = toSafeSlotCount(
    publicAvailability?.openSlots ?? properties.availableSlots
  );
  const totalSlots = toSafeSlotCount(
    publicAvailability?.totalSlots ?? properties.totalSlots,
    availableSlots
  );

  return buildPublicAvailability({
    availabilitySource:
      publicAvailability?.availabilitySource === "LEGACY_BOOKING" ||
      publicAvailability?.availabilitySource === "HOST_MANAGED"
        ? publicAvailability.availabilitySource
        : undefined,
    openSlots: availableSlots,
    totalSlots,
    availableFrom:
      typeof publicAvailability?.availableFrom === "string"
        ? publicAvailability.availableFrom
        : null,
    availableUntil:
      typeof publicAvailability?.availableUntil === "string"
        ? publicAvailability.availableUntil
        : null,
    minStayMonths: toSafeSlotCount(publicAvailability?.minStayMonths, 1),
    lastConfirmedAt:
      typeof publicAvailability?.lastConfirmedAt === "string"
        ? publicAvailability.lastConfirmedAt
        : null,
  });
}

export function searchV2MapToListings(mapData: SearchV2Map): MapListingData[] {
  const pinTierMap = new Map<string, "primary" | "mini">();
  if (mapData.pins) {
    for (const pin of mapData.pins) {
      if (pin.tier) {
        pinTierMap.set(pin.id, pin.tier);
      }
    }
  }

  return mapData.geojson.features.reduce<MapListingData[]>(
    (listings, feature) => {
      const coordinates = feature.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return listings;
      }

      const lng = toFiniteNumber(coordinates[0], Number.NaN);
      const lat = toFiniteNumber(coordinates[1], Number.NaN);
      if (!hasValidCoordinateRange(lat, lng)) {
        return listings;
      }

      const properties = feature.properties as PartialMapFeatureProperties;
      if (typeof properties.id !== "string" || properties.id.length === 0) {
        return listings;
      }

      const publicCoordinates = toPublicCoordinates({ lat, lng });
      // Re-validate after rounding: near-origin coords pass the raw guard but
      // can round to (0,0) (null island) at the public 2dp precision.
      if (
        !hasValidCoordinateRange(publicCoordinates.lat, publicCoordinates.lng)
      ) {
        return listings;
      }
      const publicAvailability = toMapPublicAvailability(properties);

      listings.push({
        id: properties.id,
        title:
          typeof properties.title === "string" ? properties.title.trim() : "",
        price: Math.max(0, toFiniteNumber(properties.price, 0)),
        availableSlots: publicAvailability.openSlots,
        totalSlots: publicAvailability.totalSlots,
        images:
          typeof properties.image === "string" && properties.image.length > 0
            ? [properties.image]
            : [],
        location: {
          lat: publicCoordinates.lat,
          lng: publicCoordinates.lng,
        },
        publicAvailability,
        groupKey: null,
        groupSummary: null,
        groupContext: isPublicGroupContext(properties.groupContext)
          ? properties.groupContext
          : null,
        hostIdentityStatus: toHostIdentityStatus(
          properties.hostIdentityStatus
        ),
        tier: pinTierMap.get(properties.id),
        avgRating: toFiniteNumber(properties.avgRating, 0),
        reviewCount: toSafeSlotCount(properties.reviewCount),
        recommendedScore:
          properties.recommendedScore == null
            ? null
            : Number.isFinite(
                  toFiniteNumber(properties.recommendedScore, Number.NaN)
                )
              ? toFiniteNumber(properties.recommendedScore)
              : null,
        createdAt: toSafeDate(properties.createdAt),
      });

      return listings;
    },
    []
  );
}
