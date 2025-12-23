import { prisma } from '@/lib/prisma';
import { wrapDatabaseError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export interface ListingData {
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
    genderPreference?: string;
    householdGender?: string;
    leaseDuration?: string;
    roomType?: string;
    moveInDate?: Date;
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

export type SortOption = 'recommended' | 'price_asc' | 'price_desc' | 'newest' | 'rating';

export interface FilterParams {
    query?: string;
    minPrice?: number;
    maxPrice?: number;
    amenities?: string[];
    moveInDate?: string;
    leaseDuration?: string;
    houseRules?: string[];
    roomType?: string;
    languages?: string[];
    genderPreference?: string;
    householdGender?: string;
    bounds?: {
        minLat: number;
        maxLat: number;
        minLng: number;
        maxLng: number;
    };
    page?: number;
    limit?: number;
    sort?: SortOption;
}

export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// Constants for query validation
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 200;

// Helper function to sanitize search query and escape special characters
// Supports international characters (unicode) while escaping SQL-dangerous chars
export function sanitizeSearchQuery(query: string): string {
    if (!query) return '';

    // Trim and limit length first
    let sanitized = query.trim().slice(0, MAX_QUERY_LENGTH);

    // Unicode normalization (NFC) - ensures consistent representation
    // e.g., "café" composed vs decomposed forms are treated the same
    sanitized = sanitized.normalize('NFC');

    // Remove invisible/zero-width characters that could bypass validation
    // Includes: ZWSP, ZWJ, ZWNJ, RTL/LTR overrides, BOM, etc.
    sanitized = sanitized
        .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '') // Zero-width and formatting chars
        .replace(/[\u2060-\u206F]/g, '')  // Word joiners, invisible operators
        .replace(/[\uDB40-\uDBFF][\uDC00-\uDFFF]/g, ''); // Tag characters

    // Encode HTML entities to prevent XSS
    // This ensures that even if displayed, it won't execute as HTML
    sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Escape SQL LIKE special characters
    sanitized = sanitized
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');

    // Remove only truly dangerous characters, keep unicode letters/numbers
    // Allow: letters (any language), numbers, spaces, common punctuation
    // Remove: SQL injection chars, control chars, etc.
    sanitized = sanitized
        .replace(/[\x00-\x1F\x7F]/g, '') // Control characters
        .replace(/[;'"\\`]/g, '')         // SQL-dangerous quotes and semicolons
        .replace(/--/g, '')               // SQL comment
        .replace(/\/\*/g, '')             // SQL block comment start
        .replace(/\*\//g, '');            // SQL block comment end

    return sanitized.trim();
}

// Validate query meets minimum requirements
export function isValidQuery(query: string): boolean {
    const sanitized = sanitizeSearchQuery(query);
    return sanitized.length >= MIN_QUERY_LENGTH;
}

function parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

// Check if coordinates are valid (not NULL, not zero, within valid range)
// lat=0, lng=0 is in the Gulf of Guinea and not a valid address
export function hasValidCoordinates(lat: number | null | undefined, lng: number | null | undefined): boolean {
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
        return false;
    }
    // Check for zero coordinates (invalid geocoding result)
    if (lat === 0 && lng === 0) {
        return false;
    }
    // Check valid ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return false;
    }
    return true;
}

/**
 * Detects if bounds cross the antimeridian (international date line at ±180°).
 * When map view spans from Asia to Americas, minLng (west) > maxLng (east).
 * This is a valid scenario requiring split queries.
 */
export function crossesAntimeridian(minLng: number, maxLng: number): boolean {
    return minLng > maxLng;
}

// Extended listing type with computed fields for filtering/sorting
export interface ListingWithMetadata extends ListingData {
    createdAt: Date;
    viewCount: number;
    avgRating: number;
    reviewCount: number;
}

// ============================================
// Pure filter functions for testability
// ============================================

// Filter by price range
export function filterByPrice<T extends { price: number }>(
    listings: T[],
    minPrice?: number | null,
    maxPrice?: number | null
): T[] {
    let results = listings;
    if (minPrice !== undefined && minPrice !== null) {
        results = results.filter(l => l.price >= minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== null) {
        results = results.filter(l => l.price <= maxPrice);
    }
    return results;
}

// Filter by amenities (AND logic - must have ALL selected)
export function filterByAmenities<T extends { amenities: string[] }>(
    listings: T[],
    amenities?: string[]
): T[] {
    if (!amenities || amenities.length === 0) return listings;
    // Use partial matching: UI sends 'Pool' but DB has 'Pool Access'
    const amenitiesLower = amenities.map(a => a.toLowerCase());
    return listings.filter(l =>
        amenitiesLower.every(a => l.amenities.some((la: string) => la.toLowerCase().includes(a)))
    );
}

// Filter by house rules (AND logic - must have ALL selected)
export function filterByHouseRules<T extends { houseRules: string[] }>(
    listings: T[],
    houseRules?: string[]
): T[] {
    if (!houseRules || houseRules.length === 0) return listings;
    const rulesLower = houseRules.map(r => r.toLowerCase());
    return listings.filter(l =>
        rulesLower.every(r => l.houseRules.some((hr: string) => hr.toLowerCase() === r))
    );
}

// Filter by languages (OR logic - show if household speaks ANY selected language)
export function filterByLanguages<T extends { householdLanguages: string[] }>(
    listings: T[],
    languages?: string[]
): T[] {
    if (!languages || languages.length === 0) return listings;
    const languagesLower = languages.map(l => l.toLowerCase());
    return listings.filter(listing =>
        languagesLower.some(lang =>
            listing.householdLanguages.some((ll: string) => ll.toLowerCase() === lang)
        )
    );
}

// Filter by room type (exact match, case-insensitive)
export function filterByRoomType<T extends { roomType?: string }>(
    listings: T[],
    roomType?: string
): T[] {
    if (!roomType) return listings;
    const roomTypeLower = roomType.toLowerCase();
    return listings.filter(l =>
        l.roomType && l.roomType.toLowerCase() === roomTypeLower
    );
}

// Filter by lease duration (exact match, case-insensitive)
export function filterByLeaseDuration<T extends { leaseDuration?: string }>(
    listings: T[],
    leaseDuration?: string
): T[] {
    if (!leaseDuration) return listings;
    const leaseLower = leaseDuration.toLowerCase();
    return listings.filter(l =>
        l.leaseDuration && l.leaseDuration.toLowerCase() === leaseLower
    );
}

// Filter by move-in date (listing available by target date)
export function filterByMoveInDate<T extends { moveInDate?: Date }>(
    listings: T[],
    moveInDate?: string
): T[] {
    if (!moveInDate) return listings;
    const targetDate = new Date(moveInDate);
    return listings.filter(l =>
        !l.moveInDate || new Date(l.moveInDate) <= targetDate
    );
}

// Filter by gender preference (exact match, case-insensitive)
export function filterByGenderPreference<T extends { genderPreference?: string }>(
    listings: T[],
    genderPreference?: string
): T[] {
    if (!genderPreference) return listings;
    const prefLower = genderPreference.toLowerCase();
    return listings.filter(l =>
        l.genderPreference && l.genderPreference.toLowerCase() === prefLower
    );
}

// Filter by household gender (exact match, case-insensitive)
export function filterByHouseholdGender<T extends { householdGender?: string }>(
    listings: T[],
    householdGender?: string
): T[] {
    if (!householdGender) return listings;
    const householdLower = householdGender.toLowerCase();
    return listings.filter(l =>
        l.householdGender && l.householdGender.toLowerCase() === householdLower
    );
}

// Filter by geographic bounds
export function filterByBounds<T extends { location: { lat: number; lng: number } }>(
    listings: T[],
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): T[] {
    if (!bounds) return listings;
    return listings.filter(l =>
        l.location.lat >= bounds.minLat &&
        l.location.lat <= bounds.maxLat &&
        l.location.lng >= bounds.minLng &&
        l.location.lng <= bounds.maxLng
    );
}

// Filter by text query (searches title, description, city, state)
export function filterByQuery<T extends { title: string; description: string; location: { city: string; state: string } }>(
    listings: T[],
    query?: string
): T[] {
    if (!query || !isValidQuery(query)) return listings;
    const q = sanitizeSearchQuery(query).toLowerCase();
    if (!q) return listings;
    return listings.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.location.city.toLowerCase().includes(q) ||
        l.location.state.toLowerCase().includes(q)
    );
}

// ============================================
// Sorting functions for testability
// ============================================

export function sortListings(
    listings: ListingWithMetadata[],
    sort: SortOption = 'recommended'
): ListingWithMetadata[] {
    const results = [...listings]; // Don't mutate original
    switch (sort) {
        case 'price_asc':
            results.sort((a, b) => {
                const priceDiff = a.price - b.price;
                if (priceDiff !== 0) return priceDiff;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });
            break;
        case 'price_desc':
            results.sort((a, b) => {
                const priceDiff = b.price - a.price;
                if (priceDiff !== 0) return priceDiff;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });
            break;
        case 'newest':
            results.sort((a, b) => {
                const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
                if (timeDiff !== 0) return timeDiff;
                return a.id.localeCompare(b.id);
            });
            break;
        case 'rating':
            results.sort((a, b) => {
                const ratingDiff = b.avgRating - a.avgRating;
                if (ratingDiff !== 0) return ratingDiff;
                const reviewDiff = b.reviewCount - a.reviewCount;
                if (reviewDiff !== 0) return reviewDiff;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });
            break;
        case 'recommended':
        default:
            results.sort((a, b) => {
                const aScore = (a.avgRating * 20) + (a.viewCount * 0.1) + (a.reviewCount * 5);
                const bScore = (b.avgRating * 20) + (b.viewCount * 0.1) + (b.reviewCount * 5);
                const scoreDiff = bScore - aScore;
                if (scoreDiff !== 0) return scoreDiff;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });
            break;
    }
    return results;
}

// Maximum results to return for performance (prevents memory issues on wide map bounds)
const MAX_RESULTS_CAP = 500;

export async function getListings(params: FilterParams = {}): Promise<ListingData[]> {
    const { query, minPrice, maxPrice, amenities, moveInDate, leaseDuration, houseRules, roomType, languages, genderPreference, householdGender, bounds, sort = 'recommended' } = params;

    try {
    // Fetch all active listings with location data
    const listings = await prisma.$queryRaw`
      SELECT
          l.id,
          l.title,
          l.description,
          l.price,
          l.images,
          l."availableSlots",
          l."totalSlots",
          l.amenities,
          l."houseRules",
          l."household_languages",
          l."primary_home_language",
          l."genderPreference",
          l."householdGender",
          l."leaseDuration",
          l."roomType",
          l."moveInDate",
          l."ownerId",
          l."createdAt",
          l."viewCount",
          loc.address,
          loc.city,
          loc.state,
          loc.zip,
          ST_X(loc.coords::geometry) as lng,
          ST_Y(loc.coords::geometry) as lat,
          COALESCE(AVG(r.rating), 0) as avg_rating,
          COUNT(r.id) as review_count
      FROM "Listing" l
      JOIN "Location" loc ON l.id = loc."listingId"
      LEFT JOIN "Review" r ON l.id = r."listingId"
      WHERE l."availableSlots" > 0
        AND l.status = 'ACTIVE'
        AND ST_X(loc.coords::geometry) IS NOT NULL
        AND ST_Y(loc.coords::geometry) IS NOT NULL
        AND NOT (ST_X(loc.coords::geometry) = 0 AND ST_Y(loc.coords::geometry) = 0)
        AND ST_Y(loc.coords::geometry) BETWEEN -90 AND 90
        AND ST_X(loc.coords::geometry) BETWEEN -180 AND 180
      GROUP BY l.id, loc.id
      ORDER BY l."createdAt" DESC
  `;

    let results = (listings as any[]).map(l => ({
        id: l.id,
        title: l.title,
        description: l.description,
        price: Number(l.price),
        images: l.images || [],
        availableSlots: l.availableSlots,
        totalSlots: l.totalSlots,
        amenities: l.amenities || [],
        houseRules: l.houseRules || [],
        householdLanguages: l.household_languages || [],
        primaryHomeLanguage: l.primary_home_language,
        genderPreference: l.genderPreference,
        householdGender: l.householdGender,
        leaseDuration: l.leaseDuration,
        roomType: l.roomType,
        moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
        ownerId: l.ownerId,
        createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
        viewCount: Number(l.viewCount) || 0,
        avgRating: Number(l.avg_rating) || 0,
        reviewCount: Number(l.review_count) || 0,
        location: {
            address: l.address,
            city: l.city,
            state: l.state,
            zip: l.zip,
            lat: Number(l.lat) || 0,
            lng: Number(l.lng) || 0
        }
    }));

    // Apply geographic bounds filter
    if (bounds) {
        results = results.filter(l =>
            l.location.lat >= bounds.minLat &&
            l.location.lat <= bounds.maxLat &&
            l.location.lng >= bounds.minLng &&
            l.location.lng <= bounds.maxLng
        );
    }

    // Apply text search filter (with sanitization for special characters)
    // Only apply if query meets minimum length requirement (2+ chars)
    if (query && isValidQuery(query)) {
        const q = sanitizeSearchQuery(query).toLowerCase();
        if (q) {
            results = results.filter(l =>
                l.title.toLowerCase().includes(q) ||
                l.description.toLowerCase().includes(q) ||
                l.location.city.toLowerCase().includes(q) ||
                l.location.state.toLowerCase().includes(q)
            );
        }
    }

    // Apply price filters
    if (minPrice !== undefined && minPrice !== null) {
        results = results.filter(l => l.price >= minPrice);
    }

    if (maxPrice !== undefined && maxPrice !== null) {
        results = results.filter(l => l.price <= maxPrice);
    }

    // Apply amenities filter (must have ALL selected amenities, case-insensitive partial match)
    // UI sends short names like 'Pool', 'Gym' but DB has 'Pool Access', 'Gym Access'
    if (amenities && amenities.length > 0) {
        const amenitiesLower = amenities.map(a => a.toLowerCase());
        results = results.filter(l =>
            amenitiesLower.every(a => l.amenities.some((la: string) => la.toLowerCase().includes(a)))
        );
    }

    // Apply move-in date filter (listing available by target date)
    if (moveInDate) {
        const targetDate = new Date(moveInDate);
        results = results.filter(l =>
            !l.moveInDate || new Date(l.moveInDate) <= targetDate
        );
    }

    // Apply lease duration filter (case-insensitive)
    if (leaseDuration) {
        const leaseLower = leaseDuration.toLowerCase();
        results = results.filter(l =>
            l.leaseDuration && l.leaseDuration.toLowerCase() === leaseLower
        );
    }

    // Apply house rules filter (must have ALL selected rules, case-insensitive)
    if (houseRules && houseRules.length > 0) {
        const rulesLower = houseRules.map(r => r.toLowerCase());
        results = results.filter(l =>
            rulesLower.every(r => l.houseRules.some((hr: string) => hr.toLowerCase() === r))
        );
    }

    // Apply room type filter (case-insensitive)
    if (roomType) {
        const roomTypeLower = roomType.toLowerCase();
        results = results.filter(l =>
            l.roomType && l.roomType.toLowerCase() === roomTypeLower
        );
    }

    // Apply languages filter (OR logic - show listings where household speaks ANY selected language)
    if (languages && languages.length > 0) {
        const languagesLower = languages.map(l => l.toLowerCase());
        results = results.filter(listing =>
            languagesLower.some(lang =>
                listing.householdLanguages.some((ll: string) => ll.toLowerCase() === lang)
            )
        );
    }

    // Apply gender preference filter (case-insensitive)
    if (genderPreference) {
        const prefLower = genderPreference.toLowerCase();
        results = results.filter(l =>
            l.genderPreference && l.genderPreference.toLowerCase() === prefLower
        );
    }

    // Apply household gender filter (case-insensitive)
    if (householdGender) {
        const householdLower = householdGender.toLowerCase();
        results = results.filter(l =>
            l.householdGender && l.householdGender.toLowerCase() === householdLower
        );
    }

    // Apply sorting with stable secondary sort by createdAt
    // This ensures deterministic ordering when primary sort values are equal
    switch (sort) {
        case 'price_asc':
            results.sort((a, b) => {
                const priceDiff = a.price - b.price;
                if (priceDiff !== 0) return priceDiff;
                return b.createdAt.getTime() - a.createdAt.getTime(); // newer first as tiebreaker
            });
            break;
        case 'price_desc':
            results.sort((a, b) => {
                const priceDiff = b.price - a.price;
                if (priceDiff !== 0) return priceDiff;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });
            break;
        case 'newest':
            // Already sorted by createdAt, add id as ultimate tiebreaker
            results.sort((a, b) => {
                const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
                if (timeDiff !== 0) return timeDiff;
                return a.id.localeCompare(b.id);
            });
            break;
        case 'rating':
            results.sort((a, b) => {
                const ratingDiff = b.avgRating - a.avgRating;
                if (ratingDiff !== 0) return ratingDiff;
                const reviewDiff = b.reviewCount - a.reviewCount;
                if (reviewDiff !== 0) return reviewDiff;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });
            break;
        case 'recommended':
        default:
            // Recommended: combination of recency, rating, and views
            results.sort((a, b) => {
                const aScore = (a.avgRating * 20) + (a.viewCount * 0.1) + (a.reviewCount * 5);
                const bScore = (b.avgRating * 20) + (b.viewCount * 0.1) + (b.reviewCount * 5);
                const scoreDiff = bScore - aScore;
                if (scoreDiff !== 0) return scoreDiff;
                return b.createdAt.getTime() - a.createdAt.getTime();
            });
            break;
    }

    // Apply maximum results cap for performance (prevents memory issues on wide map bounds)
    if (results.length > MAX_RESULTS_CAP) {
        results = results.slice(0, MAX_RESULTS_CAP);
    }

    return results;
    } catch (error) {
        const dataError = wrapDatabaseError(error, 'getListings');
        dataError.log({
            operation: 'getListings',
            hasQuery: !!params.query,
            hasBounds: !!params.bounds,
            sortOption: params.sort,
        });
        throw dataError;
    }
}

// Map-optimized listing interface (minimal fields for markers)
export interface MapListingData {
    id: string;
    title: string;
    price: number;
    availableSlots: number;
    ownerId: string;
    images: string[];
    location: {
        lat: number;
        lng: number;
    };
}

// Maximum map markers to return (prevents UI performance issues)
const MAX_MAP_MARKERS = 200;

/**
 * Optimized query for map markers - uses SQL-level bounds filtering
 * and returns only the fields needed for map display.
 *
 * Performance improvements over getListings():
 * - SQL-level bounds filtering with PostGIS ST_Intersects (uses spatial index)
 * - Returns only 8 fields vs 20+ fields
 * - LIMIT 200 at SQL level (not post-fetch)
 * - ~70% smaller payload per listing
 */
export async function getMapListings(params: FilterParams = {}): Promise<MapListingData[]> {
    const { query, minPrice, maxPrice, bounds, languages, amenities, houseRules, moveInDate, leaseDuration, roomType, genderPreference, householdGender } = params;

    // Build WHERE conditions dynamically
    const conditions: string[] = [
        'l."availableSlots" > 0',
        "l.status = 'ACTIVE'",
        'ST_X(loc.coords::geometry) IS NOT NULL',
        'ST_Y(loc.coords::geometry) IS NOT NULL',
        'NOT (ST_X(loc.coords::geometry) = 0 AND ST_Y(loc.coords::geometry) = 0)',
        'ST_Y(loc.coords::geometry) BETWEEN -90 AND 90',
        'ST_X(loc.coords::geometry) BETWEEN -180 AND 180'
    ];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // SQL-level bounds filtering using PostGIS spatial index with antimeridian support
    if (bounds) {
        if (crossesAntimeridian(bounds.minLng, bounds.maxLng)) {
            // Split into two envelopes for antimeridian crossing
            // Envelope 1: minLng to 180 (eastern side)
            // Envelope 2: -180 to maxLng (western side)
            conditions.push(`(
                ST_Intersects(loc.coords, ST_MakeEnvelope($${paramIndex++}, $${paramIndex++}, 180, $${paramIndex++}, 4326))
                OR ST_Intersects(loc.coords, ST_MakeEnvelope(-180, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 4326))
            )`);
            queryParams.push(bounds.minLng, bounds.minLat, bounds.maxLat); // Eastern envelope
            queryParams.push(bounds.minLat, bounds.maxLng, bounds.maxLat); // Western envelope
        } else {
            // Normal envelope
            conditions.push(`ST_Intersects(loc.coords, ST_MakeEnvelope($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 4326))`);
            queryParams.push(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat);
        }
    }

    // SQL-level price filtering
    if (minPrice !== undefined && minPrice !== null) {
        conditions.push(`l.price >= $${paramIndex++}`);
        queryParams.push(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== null) {
        conditions.push(`l.price <= $${paramIndex++}`);
        queryParams.push(maxPrice);
    }

    // Text search filter (SQL level, case-insensitive, with sanitization)
    if (query && isValidQuery(query)) {
        const sanitizedQuery = sanitizeSearchQuery(query);
        if (sanitizedQuery) {
            const searchPattern = `%${sanitizedQuery}%`;
            conditions.push(`(
                LOWER(l.title) LIKE LOWER($${paramIndex}) OR
                LOWER(l.description) LIKE LOWER($${paramIndex}) OR
                LOWER(loc.city) LIKE LOWER($${paramIndex}) OR
                LOWER(loc.state) LIKE LOWER($${paramIndex})
            )`);
            queryParams.push(searchPattern);
            paramIndex++;
        }
    }

    // Room type filter (SQL level, case-insensitive)
    if (roomType) {
        conditions.push(`LOWER(l."roomType") = LOWER($${paramIndex++})`);
        queryParams.push(roomType);
    }

    // Lease duration filter (SQL level, case-insensitive)
    if (leaseDuration) {
        conditions.push(`LOWER(l."leaseDuration") = LOWER($${paramIndex++})`);
        queryParams.push(leaseDuration);
    }

    // Move-in date filter (SQL level)
    if (moveInDate) {
        conditions.push(`(l."moveInDate" IS NULL OR l."moveInDate" <= $${paramIndex++})`);
        queryParams.push(parseDateOnly(moveInDate));
    }

    // Gender preference filter (SQL level, case-insensitive)
    if (genderPreference) {
        conditions.push(`LOWER(l."genderPreference") = LOWER($${paramIndex++})`);
        queryParams.push(genderPreference);
    }

    // Household gender filter (SQL level, case-insensitive)
    if (householdGender) {
        conditions.push(`LOWER(l."householdGender") = LOWER($${paramIndex++})`);
        queryParams.push(householdGender);
    }

    // Languages filter (SQL level with GIN index) - OR logic
    if (languages?.length) {
        const normalized = languages.map(l => l.trim().toLowerCase()).filter(Boolean);
        if (normalized.length > 0) {
            conditions.push(`l."household_languages" && $${paramIndex++}::text[]`);
            queryParams.push(normalized);
        }
    }

    // Amenities filter (SQL level) - AND logic: must have ALL selected amenities
    // NULL safety: filter out NULL values from unnest to prevent LOWER(NULL) issues
    if (amenities?.length) {
        const normalizedAmenities = amenities.map(a => a.trim().toLowerCase()).filter(Boolean);
        if (normalizedAmenities.length > 0) {
            conditions.push(`ARRAY(SELECT LOWER(x) FROM unnest(l.amenities) AS x WHERE x IS NOT NULL) @> $${paramIndex++}::text[]`);
            queryParams.push(normalizedAmenities);
        }
    }

    // House rules filter (SQL level) - AND logic: must have ALL selected house rules
    // NULL safety: filter out NULL values from unnest to prevent LOWER(NULL) issues
    if (houseRules?.length) {
        const normalizedRules = houseRules.map(r => r.trim().toLowerCase()).filter(Boolean);
        if (normalizedRules.length > 0) {
            conditions.push(`ARRAY(SELECT LOWER(x) FROM unnest(l."houseRules") AS x WHERE x IS NOT NULL) @> $${paramIndex++}::text[]`);
            queryParams.push(normalizedRules);
        }
    }

    const whereClause = conditions.join(' AND ');

    // Query with minimal fields for map markers
    const sqlQuery = `
        SELECT
            l.id,
            l.title,
            l.price,
            l."availableSlots",
            l."ownerId",
            l.images,
            ST_X(loc.coords::geometry) as lng,
            ST_Y(loc.coords::geometry) as lat
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        WHERE ${whereClause}
        ORDER BY l."createdAt" DESC
        LIMIT ${MAX_MAP_MARKERS}
    `;

    try {
        const listings = await prisma.$queryRawUnsafe<any[]>(sqlQuery, ...queryParams);

        return listings.map(l => ({
            id: l.id,
            title: l.title,
            price: Number(l.price),
            availableSlots: l.availableSlots,
            ownerId: l.ownerId,
            images: l.images || [],
            location: {
                lat: Number(l.lat) || 0,
                lng: Number(l.lng) || 0
            }
        }));
    } catch (error) {
        const dataError = wrapDatabaseError(error, 'getMapListings');
        dataError.log({
            operation: 'getMapListings',
            hasBounds: !!params?.bounds,
        });
        throw dataError;
    }
}

export async function getListingsPaginated(params: FilterParams = {}): Promise<PaginatedResult<ListingData>> {
    const { query, minPrice, maxPrice, amenities, moveInDate, leaseDuration, houseRules, roomType, languages, genderPreference, householdGender, bounds, sort = 'recommended', page = 1, limit = 12 } = params;

    try {
    // Build dynamic WHERE conditions for SQL
    const conditions: string[] = [
        'l."availableSlots" > 0',
        "l.status = 'ACTIVE'",
        // Exclude listings with invalid coordinates (null, zero, or out of range)
        'ST_X(loc.coords::geometry) IS NOT NULL',
        'ST_Y(loc.coords::geometry) IS NOT NULL',
        'NOT (ST_X(loc.coords::geometry) = 0 AND ST_Y(loc.coords::geometry) = 0)',
        'ST_Y(loc.coords::geometry) BETWEEN -90 AND 90',
        'ST_X(loc.coords::geometry) BETWEEN -180 AND 180'
    ];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Geographic bounds filter (SQL level) with antimeridian support
    if (bounds) {
        // Latitude bounds (always simple range check)
        conditions.push(`ST_Y(loc.coords::geometry) >= $${paramIndex++}`);
        queryParams.push(bounds.minLat);
        conditions.push(`ST_Y(loc.coords::geometry) <= $${paramIndex++}`);
        queryParams.push(bounds.maxLat);

        // Longitude bounds (may cross antimeridian when minLng > maxLng)
        if (crossesAntimeridian(bounds.minLng, bounds.maxLng)) {
            // Split query: (minLng to 180) OR (-180 to maxLng)
            conditions.push(`(ST_X(loc.coords::geometry) >= $${paramIndex++} OR ST_X(loc.coords::geometry) <= $${paramIndex++})`);
            queryParams.push(bounds.minLng);
            queryParams.push(bounds.maxLng);
        } else {
            // Normal longitude range
            conditions.push(`ST_X(loc.coords::geometry) >= $${paramIndex++}`);
            queryParams.push(bounds.minLng);
            conditions.push(`ST_X(loc.coords::geometry) <= $${paramIndex++}`);
            queryParams.push(bounds.maxLng);
        }
    }

    // Price range filter (SQL level)
    if (minPrice !== undefined && minPrice !== null) {
        conditions.push(`l.price >= $${paramIndex++}`);
        queryParams.push(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== null) {
        conditions.push(`l.price <= $${paramIndex++}`);
        queryParams.push(maxPrice);
    }

    // Text search filter (SQL level, case-insensitive, with sanitization)
    // Only apply if query meets minimum length requirement
    if (query && isValidQuery(query)) {
        const sanitizedQuery = sanitizeSearchQuery(query);
        if (sanitizedQuery) {
            const searchPattern = `%${sanitizedQuery}%`;
            conditions.push(`(
                LOWER(l.title) LIKE LOWER($${paramIndex}) OR
                LOWER(l.description) LIKE LOWER($${paramIndex}) OR
                LOWER(loc.city) LIKE LOWER($${paramIndex}) OR
                LOWER(loc.state) LIKE LOWER($${paramIndex})
            )`);
            queryParams.push(searchPattern);
            paramIndex++;
        }
    }

    // Room type filter (SQL level, case-insensitive)
    if (roomType) {
        conditions.push(`LOWER(l."roomType") = LOWER($${paramIndex++})`);
        queryParams.push(roomType);
    }

    // Lease duration filter (SQL level, case-insensitive)
    if (leaseDuration) {
        conditions.push(`LOWER(l."leaseDuration") = LOWER($${paramIndex++})`);
        queryParams.push(leaseDuration);
    }

    // Move-in date filter (SQL level)
    if (moveInDate) {
        conditions.push(`(l."moveInDate" IS NULL OR l."moveInDate" <= $${paramIndex++})`);
        queryParams.push(parseDateOnly(moveInDate));
    }

    // Gender preference filter (SQL level, case-insensitive)
    if (genderPreference) {
        conditions.push(`LOWER(l."genderPreference") = LOWER($${paramIndex++})`);
        queryParams.push(genderPreference);
    }

    // Household gender filter (SQL level, case-insensitive)
    if (householdGender) {
        conditions.push(`LOWER(l."householdGender") = LOWER($${paramIndex++})`);
        queryParams.push(householdGender);
    }

    // Languages filter (SQL level with GIN index) - OR logic
    // Pass ONE array param - simpler, fewer bugs, uses GIN index
    if (languages?.length) {
        const normalized = languages.map(l => l.trim().toLowerCase()).filter(Boolean);
        if (normalized.length > 0) {
            conditions.push(`l."household_languages" && $${paramIndex++}::text[]`);
            queryParams.push(normalized);
        }
    }

    // Amenities filter (SQL level) - AND logic: must have ALL selected amenities
    // Uses partial matching: UI sends 'Pool' but DB has 'Pool Access'
    // Checks that every search term matches at least one amenity via LIKE
    if (amenities?.length) {
        const normalizedAmenities = amenities.map(a => a.trim().toLowerCase()).filter(Boolean);
        if (normalizedAmenities.length > 0) {
            // For each search term, ensure at least one amenity contains it
            conditions.push(`NOT EXISTS (
                SELECT 1 FROM unnest($${paramIndex++}::text[]) AS search_term
                WHERE NOT EXISTS (
                    SELECT 1 FROM unnest(l.amenities) AS la
                    WHERE LOWER(la) LIKE '%' || search_term || '%'
                )
            )`);
            queryParams.push(normalizedAmenities);
        }
    }

    // House rules filter (SQL level) - AND logic: must have ALL selected house rules
    // Uses case-insensitive array containment with NULL safety
    if (houseRules?.length) {
        const normalizedRules = houseRules.map(r => r.trim().toLowerCase()).filter(Boolean);
        if (normalizedRules.length > 0) {
            conditions.push(`ARRAY(SELECT LOWER(x) FROM unnest(l."houseRules") AS x WHERE x IS NOT NULL) @> $${paramIndex++}::text[]`);
            queryParams.push(normalizedRules);
        }
    }

    const whereClause = conditions.join(' AND ');

    // Build ORDER BY clause based on sort option
    let orderByClause: string;
    switch (sort) {
        case 'price_asc':
            orderByClause = 'l.price ASC, l."createdAt" DESC';
            break;
        case 'price_desc':
            orderByClause = 'l.price DESC, l."createdAt" DESC';
            break;
        case 'newest':
            orderByClause = 'l."createdAt" DESC, l.id ASC';
            break;
        case 'rating':
            orderByClause = 'COALESCE(AVG(r.rating), 0) DESC, COUNT(r.id) DESC, l."createdAt" DESC';
            break;
        case 'recommended':
        default:
            orderByClause = '(COALESCE(AVG(r.rating), 0) * 20 + l."viewCount" * 0.1 + COUNT(r.id) * 5) DESC, l."createdAt" DESC';
            break;
    }

    // Execute count query for pagination (without LIMIT/OFFSET)
    const countQuery = `
        SELECT COUNT(DISTINCT l.id) as total
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        WHERE ${whereClause}
    `;

    const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(countQuery, ...queryParams);
    const total = Number(countResult[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);
    const safePage = totalPages > 0 ? Math.max(1, Math.min(page, totalPages)) : 1;
    const offset = (safePage - 1) * limit;

    // Execute main query with LIMIT/OFFSET
    const dataQuery = `
        SELECT
            l.id,
            l.title,
            l.description,
            l.price,
            l.images,
            l."availableSlots",
            l."totalSlots",
            l.amenities,
            l."houseRules",
            l."household_languages",
            l."primary_home_language",
            l."genderPreference",
            l."householdGender",
            l."leaseDuration",
            l."roomType",
            l."moveInDate",
            l."ownerId",
            l."createdAt",
            l."viewCount",
            loc.address,
            loc.city,
            loc.state,
            loc.zip,
            ST_X(loc.coords::geometry) as lng,
            ST_Y(loc.coords::geometry) as lat,
            COALESCE(AVG(r.rating), 0) as avg_rating,
            COUNT(r.id) as review_count
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        LEFT JOIN "Review" r ON l.id = r."listingId"
        WHERE ${whereClause}
        GROUP BY l.id, loc.id
        ORDER BY ${orderByClause}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    // Add limit and offset to params
    const dataParams = [...queryParams, limit, offset];

    const listings = await prisma.$queryRawUnsafe<any[]>(dataQuery, ...dataParams);

    // Map results and apply JS-level filters for amenities/house rules/languages
    let results = listings.map(l => ({
        id: l.id,
        title: l.title,
        description: l.description,
        price: Number(l.price),
        images: l.images || [],
        availableSlots: l.availableSlots,
        totalSlots: l.totalSlots,
        amenities: l.amenities || [],
        houseRules: l.houseRules || [],
        householdLanguages: l.household_languages || [],
        primaryHomeLanguage: l.primary_home_language,
        genderPreference: l.genderPreference,
        householdGender: l.householdGender,
        leaseDuration: l.leaseDuration,
        roomType: l.roomType,
        moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
        ownerId: l.ownerId,
        createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
        viewCount: Number(l.viewCount) || 0,
        avgRating: Number(l.avg_rating) || 0,
        reviewCount: Number(l.review_count) || 0,
        location: {
            address: l.address,
            city: l.city,
            state: l.state,
            zip: l.zip,
            lat: Number(l.lat) || 0,
            lng: Number(l.lng) || 0
        }
    }));

    // All filters are now applied at SQL level for accurate pagination counts:
    // - Languages: GIN index with && operator (OR logic)
    // - Amenities: Case-insensitive array containment with @> operator (AND logic)
    // - House rules: Case-insensitive array containment with @> operator (AND logic)

    return {
        items: results,
        total,
        page: safePage,
        limit,
        totalPages
    };
    } catch (error) {
        const dataError = wrapDatabaseError(error, 'getListingsPaginated');
        dataError.log({
            operation: 'getListingsPaginated',
            hasQuery: !!params.query,
            hasBounds: !!params.bounds,
            page: params.page,
            sortOption: params.sort,
        });
        throw dataError;
    }
}

// Types for filter analysis
export interface FilterSuggestion {
    filter: string;
    label: string;
    resultsWithout: number;
    suggestion: string;
}

/**
 * P0 fix: Efficient COUNT query for filter analysis
 * Replaces the inefficient getListingsCount() that fetched ALL data just to return .length
 * This version only runs a lightweight COUNT query with the same WHERE clause logic.
 */
async function getListingsCountEfficient(params: FilterParams): Promise<number> {
    const { query, minPrice, maxPrice, amenities, moveInDate, leaseDuration, houseRules, roomType, languages, genderPreference, householdGender, bounds } = params;

    // Build dynamic WHERE conditions for SQL (same logic as getListingsPaginated)
    const conditions: string[] = [
        'l."availableSlots" > 0',
        "l.status = 'ACTIVE'",
        // Exclude listings with invalid coordinates
        'ST_X(loc.coords::geometry) IS NOT NULL',
        'ST_Y(loc.coords::geometry) IS NOT NULL',
        'NOT (ST_X(loc.coords::geometry) = 0 AND ST_Y(loc.coords::geometry) = 0)',
        'ST_Y(loc.coords::geometry) BETWEEN -90 AND 90',
        'ST_X(loc.coords::geometry) BETWEEN -180 AND 180'
    ];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Geographic bounds filter with antimeridian support
    if (bounds) {
        conditions.push(`ST_Y(loc.coords::geometry) >= $${paramIndex++}`);
        queryParams.push(bounds.minLat);
        conditions.push(`ST_Y(loc.coords::geometry) <= $${paramIndex++}`);
        queryParams.push(bounds.maxLat);

        if (crossesAntimeridian(bounds.minLng, bounds.maxLng)) {
            conditions.push(`(ST_X(loc.coords::geometry) >= $${paramIndex++} OR ST_X(loc.coords::geometry) <= $${paramIndex++})`);
            queryParams.push(bounds.minLng);
            queryParams.push(bounds.maxLng);
        } else {
            conditions.push(`ST_X(loc.coords::geometry) >= $${paramIndex++}`);
            queryParams.push(bounds.minLng);
            conditions.push(`ST_X(loc.coords::geometry) <= $${paramIndex++}`);
            queryParams.push(bounds.maxLng);
        }
    }

    // Price range filter
    if (minPrice !== undefined && minPrice !== null) {
        conditions.push(`l.price >= $${paramIndex++}`);
        queryParams.push(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== null) {
        conditions.push(`l.price <= $${paramIndex++}`);
        queryParams.push(maxPrice);
    }

    // Text search filter
    if (query && isValidQuery(query)) {
        const sanitizedQuery = sanitizeSearchQuery(query);
        if (sanitizedQuery) {
            const searchPattern = `%${sanitizedQuery}%`;
            conditions.push(`(
                LOWER(l.title) LIKE LOWER($${paramIndex}) OR
                LOWER(l.description) LIKE LOWER($${paramIndex}) OR
                LOWER(loc.city) LIKE LOWER($${paramIndex}) OR
                LOWER(loc.state) LIKE LOWER($${paramIndex})
            )`);
            queryParams.push(searchPattern);
            paramIndex++;
        }
    }

    // Room type filter
    if (roomType) {
        conditions.push(`LOWER(l."roomType") = LOWER($${paramIndex++})`);
        queryParams.push(roomType);
    }

    // Lease duration filter
    if (leaseDuration) {
        conditions.push(`LOWER(l."leaseDuration") = LOWER($${paramIndex++})`);
        queryParams.push(leaseDuration);
    }

    // Move-in date filter
    if (moveInDate) {
        conditions.push(`(l."moveInDate" IS NULL OR l."moveInDate" <= $${paramIndex++})`);
        queryParams.push(parseDateOnly(moveInDate));
    }

    // Gender preference filter
    if (genderPreference) {
        conditions.push(`LOWER(l."genderPreference") = LOWER($${paramIndex++})`);
        queryParams.push(genderPreference);
    }

    // Household gender filter
    if (householdGender) {
        conditions.push(`LOWER(l."householdGender") = LOWER($${paramIndex++})`);
        queryParams.push(householdGender);
    }

    // Languages filter (OR logic)
    if (languages?.length) {
        const normalized = languages.map(l => l.trim().toLowerCase()).filter(Boolean);
        if (normalized.length > 0) {
            conditions.push(`l."household_languages" && $${paramIndex++}::text[]`);
            queryParams.push(normalized);
        }
    }

    // Amenities filter (AND logic)
    if (amenities?.length) {
        const normalizedAmenities = amenities.map(a => a.trim().toLowerCase()).filter(Boolean);
        if (normalizedAmenities.length > 0) {
            conditions.push(`ARRAY(SELECT LOWER(x) FROM unnest(l.amenities) AS x WHERE x IS NOT NULL) @> $${paramIndex++}::text[]`);
            queryParams.push(normalizedAmenities);
        }
    }

    // House rules filter (AND logic)
    if (houseRules?.length) {
        const normalizedRules = houseRules.map(r => r.trim().toLowerCase()).filter(Boolean);
        if (normalizedRules.length > 0) {
            conditions.push(`ARRAY(SELECT LOWER(x) FROM unnest(l."houseRules") AS x WHERE x IS NOT NULL) @> $${paramIndex++}::text[]`);
            queryParams.push(normalizedRules);
        }
    }

    const whereClause = conditions.join(' AND ');

    // Execute lightweight COUNT query only
    const countQuery = `
        SELECT COUNT(DISTINCT l.id) as total
        FROM "Listing" l
        JOIN "Location" loc ON l.id = loc."listingId"
        WHERE ${whereClause}
    `;

    try {
        const result = await prisma.$queryRawUnsafe<[{ total: bigint }]>(countQuery, ...queryParams);
        return Number(result[0]?.total ?? 0);
    } catch (error) {
        const dataError = wrapDatabaseError(error, 'getListingsCountEfficient');
        dataError.log({
            operation: 'getListingsCountEfficient',
        });
        throw dataError;
    }
}

// Safe wrapper for count queries in filter analysis - graceful degradation
async function safeGetCount(params: FilterParams): Promise<number | null> {
    try {
        return await getListingsCountEfficient(params);
    } catch (error) {
        logger.sync.warn('Filter analysis count failed', {
            error: error instanceof Error ? error.message : String(error)
        });
        return null; // Skip this suggestion
    }
}

// Analyze which filters are most restrictive and suggest removing them
// P0 fix: Now uses efficient COUNT queries instead of fetching all data
export async function analyzeFilterImpact(params: FilterParams): Promise<FilterSuggestion[]> {
    const suggestions: FilterSuggestion[] = [];

    // Test removing price filters
    if (params.maxPrice !== undefined) {
        const withoutMaxPrice = await safeGetCount({ ...params, maxPrice: undefined });
        if (withoutMaxPrice !== null && withoutMaxPrice > 0) {
            suggestions.push({
                filter: 'maxPrice',
                label: `max price ($${params.maxPrice})`,
                resultsWithout: withoutMaxPrice,
                suggestion: `Increase your budget to see ${withoutMaxPrice} more listing${withoutMaxPrice > 1 ? 's' : ''}`
            });
        }
    }

    if (params.minPrice !== undefined && params.minPrice > 0) {
        const withoutMinPrice = await safeGetCount({ ...params, minPrice: undefined });
        if (withoutMinPrice !== null && withoutMinPrice > 0) {
            suggestions.push({
                filter: 'minPrice',
                label: `min price ($${params.minPrice})`,
                resultsWithout: withoutMinPrice,
                suggestion: `Lower your minimum budget to see ${withoutMinPrice} more listing${withoutMinPrice > 1 ? 's' : ''}`
            });
        }
    }

    // Test removing amenities
    if (params.amenities && params.amenities.length > 0) {
        const withoutAmenities = await safeGetCount({ ...params, amenities: [] });
        if (withoutAmenities !== null && withoutAmenities > 0) {
            suggestions.push({
                filter: 'amenities',
                label: `amenities (${params.amenities.join(', ')})`,
                resultsWithout: withoutAmenities,
                suggestion: `Remove amenity filters to see ${withoutAmenities} listing${withoutAmenities > 1 ? 's' : ''}`
            });
        }
    }

    // Test removing house rules
    if (params.houseRules && params.houseRules.length > 0) {
        const withoutHouseRules = await safeGetCount({ ...params, houseRules: [] });
        if (withoutHouseRules !== null && withoutHouseRules > 0) {
            suggestions.push({
                filter: 'houseRules',
                label: `house rules (${params.houseRules.join(', ')})`,
                resultsWithout: withoutHouseRules,
                suggestion: `Remove house rules filters to see ${withoutHouseRules} listing${withoutHouseRules > 1 ? 's' : ''}`
            });
        }
    }

    // Test removing room type
    if (params.roomType) {
        const withoutRoomType = await safeGetCount({ ...params, roomType: undefined });
        if (withoutRoomType !== null && withoutRoomType > 0) {
            suggestions.push({
                filter: 'roomType',
                label: `room type (${params.roomType})`,
                resultsWithout: withoutRoomType,
                suggestion: `Include all room types to see ${withoutRoomType} listing${withoutRoomType > 1 ? 's' : ''}`
            });
        }
    }

    // Test removing lease duration
    if (params.leaseDuration) {
        const withoutLeaseDuration = await safeGetCount({ ...params, leaseDuration: undefined });
        if (withoutLeaseDuration !== null && withoutLeaseDuration > 0) {
            suggestions.push({
                filter: 'leaseDuration',
                label: `lease duration (${params.leaseDuration})`,
                resultsWithout: withoutLeaseDuration,
                suggestion: `Include all lease durations to see ${withoutLeaseDuration} listing${withoutLeaseDuration > 1 ? 's' : ''}`
            });
        }
    }

    // Test removing location bounds (search area)
    if (params.bounds) {
        const withoutBounds = await safeGetCount({ ...params, bounds: undefined });
        if (withoutBounds !== null && withoutBounds > 0) {
            suggestions.push({
                filter: 'location',
                label: 'search area',
                resultsWithout: withoutBounds,
                suggestion: `Expand your search area to see ${withoutBounds} listing${withoutBounds > 1 ? 's' : ''}`
            });
        }
    }

    // Sort by impact (most results unlocked first)
    return suggestions.sort((a, b) => b.resultsWithout - a.resultsWithout);
}

export async function getSavedListingIds(userId: string): Promise<string[]> {
    const saved = await prisma.savedListing.findMany({
        where: { userId },
        select: { listingId: true }
    });
    return saved.map(s => s.listingId);
}

export async function getSavedListings(userId: string): Promise<ListingData[]> {
    // Use raw query to properly fetch PostGIS coordinates
    const savedListings = await prisma.$queryRaw<Array<{
        id: string;
        title: string;
        description: string;
        price: number;
        images: string[];
        availableSlots: number;
        totalSlots: number;
        amenities: string[];
        houseRules: string[];
        household_languages: string[];
        primary_home_language: string | null;
        genderPreference: string | null;
        householdGender: string | null;
        leaseDuration: string | null;
        roomType: string | null;
        moveInDate: Date | null;
        ownerId: string;
        address: string;
        city: string;
        state: string;
        zip: string;
        lat: number;
        lng: number;
    }>>`
        SELECT
            l.id,
            l.title,
            l.description,
            l.price,
            l.images,
            l."availableSlots",
            l."totalSlots",
            l.amenities,
            l."houseRules",
            l."household_languages",
            l."primary_home_language",
            l."genderPreference",
            l."householdGender",
            l."leaseDuration",
            l."roomType",
            l."moveInDate",
            l."ownerId",
            loc.address,
            loc.city,
            loc.state,
            loc.zip,
            ST_Y(loc.coords::geometry) as lat,
            ST_X(loc.coords::geometry) as lng
        FROM "SavedListing" sl
        JOIN "Listing" l ON sl."listingId" = l.id
        JOIN "Location" loc ON l.id = loc."listingId"
        WHERE sl."userId" = ${userId}
            AND l.status = 'ACTIVE'
            AND ST_X(loc.coords::geometry) IS NOT NULL
            AND ST_Y(loc.coords::geometry) IS NOT NULL
            AND NOT (ST_X(loc.coords::geometry) = 0 AND ST_Y(loc.coords::geometry) = 0)
        ORDER BY sl."createdAt" DESC
    `;

    // Filter out any listings with invalid coordinates and map to ListingData
    return savedListings
        .filter(l => hasValidCoordinates(l.lat, l.lng))
        .map(l => ({
            id: l.id,
            title: l.title,
            description: l.description,
            price: l.price,
            images: l.images || [],
            availableSlots: l.availableSlots,
            totalSlots: l.totalSlots,
            amenities: l.amenities || [],
            houseRules: l.houseRules || [],
            householdLanguages: l.household_languages || [],
            primaryHomeLanguage: l.primary_home_language ?? undefined,
            genderPreference: l.genderPreference ?? undefined,
            householdGender: l.householdGender ?? undefined,
            leaseDuration: l.leaseDuration ?? undefined,
            roomType: l.roomType ?? undefined,
            moveInDate: l.moveInDate ? new Date(l.moveInDate) : undefined,
            ownerId: l.ownerId,
            location: {
                address: l.address,
                city: l.city,
                state: l.state,
                zip: l.zip,
                lat: l.lat,
                lng: l.lng
            }
        }));
}

export async function getReviews(listingId?: string, userId?: string) {
    if (!listingId && !userId) return [];

    return await prisma.review.findMany({
        where: {
            ...(listingId ? { listingId } : {}),
            ...(userId ? { targetUserId: userId } : {})
        },
        include: {
            author: {
                select: {
                    id: true,
                    name: true,
                    image: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });
}

export async function getAverageRating(listingId?: string, userId?: string) {
    if (!listingId && !userId) return 0;

    const aggregations = await prisma.review.aggregate({
        _avg: {
            rating: true
        },
        where: {
            ...(listingId ? { listingId } : {}),
            ...(userId ? { targetUserId: userId } : {})
        }
    });

    return aggregations._avg.rating || 0;
}
