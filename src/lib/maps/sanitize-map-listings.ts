import type { MapListingData } from "@/lib/search-types";

type MapListingInput = {
  id: string;
  title?: string | null;
  price?: unknown;
  availableSlots?: unknown;
  images?: unknown;
  location?: {
    lat?: unknown;
    lng?: unknown;
  } | null;
  tier?: "primary" | "mini";
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

function toSafeSlotCount(value: unknown): number {
  return Math.max(0, Math.trunc(toFiniteNumber(value, 0)));
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
  listing: MapListingInput,
): MapListingData | null {
  const lat = toFiniteNumber(listing.location?.lat, Number.NaN);
  const lng = toFiniteNumber(listing.location?.lng, Number.NaN);

  if (!hasValidCoordinateRange(lat, lng)) {
    return null;
  }

  return {
    id: listing.id,
    title: listing.title?.trim() || "",
    price: Math.max(0, toFiniteNumber(listing.price, 0)),
    availableSlots: toSafeSlotCount(listing.availableSlots),
    images: Array.isArray(listing.images)
      ? listing.images.filter((image): image is string => typeof image === "string")
      : [],
    location: { lat, lng },
    tier: listing.tier,
  };
}

export function sanitizeMapListings(
  listings: MapListingInput[],
): MapListingData[] {
  return listings.reduce<MapListingData[]>((sanitized, listing) => {
    const safeListing = sanitizeMapListing(listing);
    if (safeListing) {
      sanitized.push(safeListing);
    }
    return sanitized;
  }, []);
}
