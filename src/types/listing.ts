/**
 * PublicListing - Cache-safe listing data transfer object
 *
 * This interface defines fields that are SAFE to cache in shared caches
 * (unstable_cache, CDN, etc.) because they contain no user-specific data.
 *
 * User-specific fields like `isSaved`, `viewedAt`, `bookingStatus` must be
 * merged separately at render time from per-user queries.
 *
 * @see src/app/search/page.tsx for how `isSaved` is merged via getSavedListingIds()
 */
export interface PublicListing {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  availableSlots: number;
  totalSlots: number;
  amenities: string[];
  houseRules: string[];
  householdLanguages: string[];
  primaryHomeLanguage?: string;
  leaseDuration?: string;
  roomType?: string;
  moveInDate?: Date;
  /** @deprecated No longer populated in API responses (S3 security fix) */
  ownerId?: string;
  location: {
    address: string;
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
  };
}

/**
 * MapListing - Minimal listing data for map markers
 * Also cache-safe (no user-specific fields)
 */
export interface PublicMapListing {
  id: string;
  title: string;
  price: number;
  availableSlots: number;
  /** @deprecated No longer populated in API responses (S3 security fix) */
  ownerId?: string;
  images: string[];
  location: {
    lat: number;
    lng: number;
  };
}

/**
 * Fields that must NEVER appear in cached listing responses.
 * These are user-specific and would cause cache poisoning if included.
 */
export const USER_SPECIFIC_FIELDS = [
  "isSaved",
  "viewedAt",
  "messageThread",
  "bookingStatus",
  "savedAt",
  "userNotes",
  "privateHostContact",
  "viewerSpecificRanking",
] as const;

export type UserSpecificField = (typeof USER_SPECIFIC_FIELDS)[number];

/**
 * Type guard to verify no user-specific fields leaked into cached data.
 * Uses a blocklist approach to catch cache poisoning.
 *
 * @param obj - Object to validate
 * @returns true if object is safe for caching (no user-specific fields)
 *
 * @example
 * ```ts
 * const listing = await fetchListing();
 * if (!isPublicListingSafe(listing)) {
 *   throw new Error('Cache safety violation');
 * }
 * ```
 */
export function isPublicListingSafe(obj: unknown): obj is PublicListing {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const record = obj as Record<string, unknown>;
  return !USER_SPECIFIC_FIELDS.some((field) => field in record);
}

/**
 * Runtime assertion for cache boundaries.
 * Throws if user-specific fields are detected in cached data.
 *
 * Use at cache write boundaries to catch accidental cache poisoning
 * during development.
 *
 * @param listing - Listing to validate
 * @returns The listing cast to PublicListing if valid
 * @throws Error if user-specific fields are detected
 */
export function assertPublicListing(listing: unknown): PublicListing {
  if (!isPublicListingSafe(listing)) {
    // Handle null/undefined/non-object cases
    if (!listing || typeof listing !== "object" || Array.isArray(listing)) {
      throw new Error(
        `Cache safety violation: expected listing object, got ${listing === null ? "null" : Array.isArray(listing) ? "array" : typeof listing}`,
      );
    }
    const record = listing as Record<string, unknown>;
    const foundFields = USER_SPECIFIC_FIELDS.filter((f) => f in record);
    throw new Error(
      `Cache safety violation: user-specific fields detected in cached listing: ${foundFields.join(", ")}`,
    );
  }
  return listing as PublicListing;
}

/**
 * Validates an array of listings for cache safety.
 *
 * @param listings - Array of listings to validate
 * @returns The listings cast to PublicListing[] if valid
 * @throws Error if any listing contains user-specific fields
 */
export function assertPublicListings(listings: unknown[]): PublicListing[] {
  return listings.map((listing, index) => {
    try {
      return assertPublicListing(listing);
    } catch (error) {
      throw new Error(
        `Cache safety violation at index ${index}: ${(error as Error).message}`,
      );
    }
  });
}
