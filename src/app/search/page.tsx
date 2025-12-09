import { auth } from '@/auth';
import { getListingsPaginated, getListings, getSavedListingIds, analyzeFilterImpact, SortOption } from '@/lib/data';
import { Suspense } from 'react';
import SearchForm from '@/components/SearchForm';
import MapComponent from '@/components/Map';
import ListingCard from '@/components/ListingCard';
import Pagination from '@/components/Pagination';
import SortSelect from '@/components/SortSelect';
import SaveSearchButton from '@/components/SaveSearchButton';
import ZeroResultsSuggestions from '@/components/ZeroResultsSuggestions';
import Link from 'next/link';
import { Search, Map, List } from 'lucide-react';
import SearchViewToggle from '@/components/SearchViewToggle';

// Skeleton component for listing cards during loading
function ListingSkeleton() {
    return (
        <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                    <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
                    <div className="h-4 w-64 bg-zinc-100 dark:bg-zinc-800 rounded mt-2 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-9 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                    <div className="h-9 w-32 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden animate-pulse">
                        <div className="aspect-[4/3] bg-zinc-200 dark:bg-zinc-700" />
                        <div className="p-4 space-y-3">
                            <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-3/4" />
                            <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
                            <div className="flex justify-between items-center pt-2">
                                <div className="h-5 bg-zinc-200 dark:bg-zinc-700 rounded w-20" />
                                <div className="h-8 w-8 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

const ITEMS_PER_PAGE = 12;

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        minPrice?: string;
        maxPrice?: string;
        amenities?: string | string[];
        moveInDate?: string;
        leaseDuration?: string;
        houseRules?: string | string[];
        roomType?: string;
        minLat?: string;
        maxLat?: string;
        minLng?: string;
        maxLng?: string;
        lat?: string;
        lng?: string;
        page?: string;
        sort?: string;
    }>;
}) {
    const { q, minPrice, maxPrice, amenities, moveInDate, leaseDuration, houseRules, roomType, minLat, maxLat, minLng, maxLng, lat, lng, page, sort } = await searchParams;
    const session = await auth();
    const userId = session?.user?.id;

    // === URL Parameter Validation ===
    // Helper function to safely parse numeric values with validation
    const safeParseFloat = (value: string | undefined, min?: number, max?: number): number | undefined => {
        if (!value) return undefined;
        const parsed = parseFloat(value);
        if (isNaN(parsed)) return undefined;
        if (min !== undefined && parsed < min) return min;
        if (max !== undefined && parsed > max) return max;
        return parsed;
    };

    const safeParseInt = (value: string | undefined, min?: number, max?: number, defaultVal?: number): number => {
        if (!value) return defaultVal ?? 1;
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) return defaultVal ?? 1;
        if (min !== undefined && parsed < min) return min;
        if (max !== undefined && parsed > max) return max;
        return parsed;
    };

    // Validate date format (YYYY-MM-DD) and ensure it's a valid date
    const safeParseDate = (value: string | undefined): string | undefined => {
        if (!value) return undefined;
        // Check format matches YYYY-MM-DD
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
        // Check if it's a valid date
        const date = new Date(value);
        if (isNaN(date.getTime())) return undefined;
        // Don't allow dates more than 2 years in the future
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 2);
        if (date > maxDate) return undefined;
        return value;
    };

    // Validate page number (will be clamped after we know totalPages)
    const requestedPage = safeParseInt(page, 1, undefined, 1);

    // Validate price range (non-negative, auto-swap if needed)
    let validMinPrice = safeParseFloat(minPrice, 0);
    let validMaxPrice = safeParseFloat(maxPrice, 0);

    // Auto-swap if min > max
    if (validMinPrice !== undefined && validMaxPrice !== undefined && validMinPrice > validMaxPrice) {
        [validMinPrice, validMaxPrice] = [validMaxPrice, validMinPrice];
    }

    // Validate coordinates (latitude: -90 to 90, longitude: -180 to 180)
    const validLat = safeParseFloat(lat, -90, 90);
    const validLng = safeParseFloat(lng, -180, 180);
    const validMinLat = safeParseFloat(minLat, -90, 90);
    const validMaxLat = safeParseFloat(maxLat, -90, 90);
    const validMinLng = safeParseFloat(minLng, -180, 180);
    const validMaxLng = safeParseFloat(maxLng, -180, 180);

    const amenitiesList = typeof amenities === 'string' ? [amenities] : amenities;
    const houseRulesList = typeof houseRules === 'string' ? [houseRules] : houseRules;

    // Calculate bounds from either explicit bounds or from center coordinates
    let bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | undefined;

    if (validMinLat !== undefined && validMaxLat !== undefined && validMinLng !== undefined && validMaxLng !== undefined) {
        // Use explicit bounds from map movement
        bounds = {
            minLat: validMinLat,
            maxLat: validMaxLat,
            minLng: validMinLng,
            maxLng: validMaxLng
        };
    } else if (validLat !== undefined && validLng !== undefined) {
        // Create bounds around the selected location (approximately 10km radius)
        const centerLat = validLat;
        const centerLng = validLng;
        const latOffset = 0.09; // ~10km in latitude

        // Adjust longitude offset based on latitude (corrects for Earth's curvature)
        // At equator, 1° longitude = ~111km. At higher latitudes, it gets shorter.
        // lngOffset = latOffset / cos(latitude)
        const lngOffset = 0.09 / Math.cos(centerLat * Math.PI / 180);

        bounds = {
            minLat: centerLat - latOffset,
            maxLat: centerLat + latOffset,
            minLng: centerLng - lngOffset,
            maxLng: centerLng + lngOffset
        };
    }

    // Validate sort option
    const validSortOptions: SortOption[] = ['recommended', 'price_asc', 'price_desc', 'newest', 'rating'];
    const sortOption: SortOption = validSortOptions.includes(sort as SortOption) ? (sort as SortOption) : 'recommended';

    // Validate moveInDate format
    const validMoveInDate = safeParseDate(moveInDate);

    const filterParams = {
        query: q,
        minPrice: validMinPrice,
        maxPrice: validMaxPrice,
        amenities: amenitiesList,
        moveInDate: validMoveInDate,
        leaseDuration,
        houseRules: houseRulesList,
        roomType,
        bounds,
        sort: sortOption
    };

    const [paginatedResult, allListings, savedListingIds] = await Promise.all([
        getListingsPaginated({ ...filterParams, page: requestedPage, limit: ITEMS_PER_PAGE }),
        getListings(filterParams), // For the map to show all listings
        userId ? getSavedListingIds(userId) : Promise.resolve([])
    ]);

    const { items: listings, total, totalPages } = paginatedResult;

    // Clamp current page to valid range (after we know totalPages)
    const currentPage = Math.max(1, Math.min(requestedPage, totalPages || 1));

    // Analyze filter impact when there are no results
    const filterSuggestions = total === 0 ? await analyzeFilterImpact(filterParams) : [];

    const listContent = (
        <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6">
            {/* Screen reader announcement for search results */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {total === 0
                    ? `No listings found${q ? ` for "${q}"` : ''}`
                    : `Found ${total} ${total === 1 ? 'listing' : 'listings'}${q ? ` for "${q}"` : ''}`
                }
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                    {/* tabIndex -1 allows programmatic focus for screen readers */}
                    <h1
                        id="search-results-heading"
                        tabIndex={-1}
                        className="text-lg sm:text-xl font-semibold text-zinc-900 dark:text-white tracking-tight outline-none"
                    >
                        {total} {total === 1 ? 'place' : 'places'} {q ? `in "${q}"` : 'available'}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Book a place that fits your lifestyle.
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    <SaveSearchButton />
                    <SortSelect currentSort={sortOption} />
                </div>
            </div>

            {total === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 sm:py-20 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl sm:rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/50">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm mb-4">
                        <Search className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white mb-2">No matches found</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-xs text-center px-4">
                        We couldn't find any listings {q ? `for "${q}"` : ''}.
                    </p>

                    {/* Smart filter suggestions */}
                    {filterSuggestions.length > 0 ? (
                        <div className="w-full max-w-sm px-4 mt-4">
                            <Suspense fallback={null}>
                                <ZeroResultsSuggestions suggestions={filterSuggestions} query={q} />
                            </Suspense>
                        </div>
                    ) : (
                        <Link
                            href="/search"
                            className="mt-6 px-4 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-medium transition-colors touch-target"
                        >
                            Clear all filters
                        </Link>
                    )}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
                        {listings.map(listing => (
                            <ListingCard
                                key={listing.id}
                                listing={listing}
                                isSaved={savedListingIds.includes(listing.id)}
                            />
                        ))}
                    </div>

                    {/* Pagination */}
                    <Suspense fallback={null}>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={total}
                            itemsPerPage={ITEMS_PER_PAGE}
                        />
                    </Suspense>
                </>
            )}
        </div>
    );

    const mapContent = <MapComponent listings={allListings} />;

    return (
        <div className="h-screen-safe flex flex-col bg-white dark:bg-zinc-950 overflow-hidden pt-20">
            {/* Search Header */}
            <header className="w-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-100 dark:border-zinc-800 relative z-50">
                <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
                    <Suspense fallback={<div className="h-14 sm:h-16 w-full bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-full" />}>
                        <SearchForm />
                    </Suspense>
                </div>
            </header>

            <SearchViewToggle mapComponent={mapContent}>
                {listContent}
            </SearchViewToggle>
        </div>
    );
}
