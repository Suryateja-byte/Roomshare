import { auth } from '@/auth';
import { getListingsPaginated, getSavedListingIds, analyzeFilterImpact, PaginatedResult, PaginatedResultHybrid, ListingData } from '@/lib/data';
import { Suspense } from 'react';
import ListingCard from '@/components/listings/ListingCard';
import Pagination from '@/components/Pagination';
import SortSelect from '@/components/SortSelect';
import SaveSearchButton from '@/components/SaveSearchButton';
import ZeroResultsSuggestions from '@/components/ZeroResultsSuggestions';
import Link from 'next/link';
import { Search, Clock } from 'lucide-react';
import { headers } from 'next/headers';
import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';
import { parseSearchParams, buildRawParamsFromSearchParams } from '@/lib/search-params';
import { executeSearchV2 } from '@/lib/search/search-v2-service';
import { V2MapDataSetter } from '@/components/search/V2MapDataSetter';
import type { V2MapData } from '@/contexts/SearchV2DataContext';
import { features } from '@/lib/env';

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
        languages?: string | string[];
        roomType?: string;
        genderPreference?: string;
        householdGender?: string;
        minLat?: string;
        maxLat?: string;
        minLng?: string;
        maxLng?: string;
        lat?: string;
        lng?: string;
        page?: string;
        sort?: string;
        cursor?: string;
        v2?: string;
    }>;
}) {
    const rawParams = await searchParams;

    // P0 fix: Rate limit check before any database queries
    const headersList = await headers();
    const rateLimit = await checkServerComponentRateLimit(headersList, 'search', '/search');
    if (!rateLimit.allowed) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
                <div className="text-center p-8 max-w-md">
                    <div className="w-16 h-16 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                        <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                        Too Many Requests
                    </h1>
                    <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                        You are searching too quickly. Please wait a moment before trying again.
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-500">
                        Try again in {rateLimit.retryAfter || 60} seconds
                    </p>
                </div>
            </div>
        );
    }

    const session = await auth();
    const userId = session?.user?.id;

    const { q, filterParams, requestedPage, sortOption, boundsRequired } = parseSearchParams(rawParams);

    // Fetch saved listings in parallel (non-blocking)
    const savedPromise = userId ? getSavedListingIds(userId) : Promise.resolve([]);

    // Early return for unbounded searches - check BEFORE any search attempt
    // This ensures friendly UX regardless of V2/V1 path or failures
    if (boundsRequired) {
        return (
            <div className="px-4 sm:px-6 py-8 sm:py-12 max-w-[840px] mx-auto">
                <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                        <Search className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                        Please select a location
                    </h2>
                    <p className="text-zinc-600 dark:text-zinc-400 max-w-md mx-auto mb-6">
                        To search for &ldquo;{q}&rdquo;, please select a location from the dropdown suggestions.
                        This helps us find relevant listings in your area.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                    >
                        <Search className="w-4 h-4" />
                        Try a new search
                    </Link>
                </div>
            </div>
        );
    }

    // Track whether v2 was used successfully
    let usedV2 = false;
    let v2MapData: V2MapData | null = null;
    let paginatedResult: PaginatedResult<ListingData> | PaginatedResultHybrid<ListingData> | undefined;

    // Check if v2 is enabled via feature flag OR query param override (?v2=1)
    const v2Override = rawParams.v2 === '1' || rawParams.v2 === 'true';
    const useV2Search = features.searchV2 || v2Override;

    // Try v2 orchestration if enabled
    if (useV2Search) {
        try {
            // Build raw params for v2 service (handles repeated params properly)
            const rawParamsForV2 = buildRawParamsFromSearchParams(new URLSearchParams(
                Object.entries(rawParams).flatMap(([key, value]) =>
                    Array.isArray(value) ? value.map(v => [key, v]) : value ? [[key, value]] : []
                )
            ));

            const v2Result = await executeSearchV2({
                rawParams: rawParamsForV2,
                limit: ITEMS_PER_PAGE,
            });

            // V2 returned valid data - use it
            if (v2Result.response && v2Result.paginatedResult) {
                // V2 succeeded - use its data
                usedV2 = true;
                paginatedResult = v2Result.paginatedResult;

                // Construct v2MapData for context injection
                // PersistentMapWrapper (in layout) will read this via SearchV2DataContext
                v2MapData = {
                    geojson: v2Result.response.map.geojson,
                    pins: v2Result.response.map.pins,
                    mode: v2Result.response.meta.mode,
                };
            }
        } catch (err) {
            // V2 failed - will fall back to v1 below
            console.warn('[search/page] V2 orchestration failed, falling back to v1:', {
                error: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    }

    // V1 fallback path (when v2 disabled or failed)
    // Note: Map data is fetched by PersistentMapWrapper independently via /api/map-listings
    if (!usedV2) {
        // Critical data - let errors bubble up to error boundary
        paginatedResult = await getListingsPaginated({ ...filterParams, page: requestedPage, limit: ITEMS_PER_PAGE });
    }

    // Handle saved listings result
    const savedListingIds = await savedPromise.catch(() => [] as string[]);

    // Ensure paginatedResult is defined (should always be set by v2 or v1 path)
    if (!paginatedResult) {
        throw new Error('Failed to fetch search results');
    }

    const { items: listings, total: rawTotal, totalPages: rawTotalPages, page: currentPage } = paginatedResult;
    // Handle potential null values from PaginatedResultHybrid (v2 path)
    // IMPORTANT: Keep null distinct from 0 - null means "unknown count (>100 results)"
    // whereas 0 means "confirmed zero results"
    const total = rawTotal; // Keep null for >100 results (hybrid count optimization)
    const totalPages = rawTotalPages ?? 1;

    // Only show zero-results UI when we have confirmed zero results (total === 0)
    // Not when total is null (unknown count, >100 results)
    const hasConfirmedZeroResults = total !== null && total === 0;

    // Analyze filter impact only when there are confirmed zero results
    const filterSuggestions = hasConfirmedZeroResults ? await analyzeFilterImpact(filterParams) : [];

    const listContent = (
        <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6">
            {/* Screen reader announcement for search results */}
            <div aria-live="polite" aria-atomic="true" className="sr-only">
                {hasConfirmedZeroResults
                    ? `No listings found${q ? ` for "${q}"` : ''}`
                    : total === null
                        ? `Found more than 100 listings${q ? ` for "${q}"` : ''}`
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
                        {total === null ? '100+' : total} {total === 1 ? 'place' : 'places'} {q ? `in "${q}"` : 'available'}
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

            {hasConfirmedZeroResults ? (
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
                            nextCursor={'nextCursor' in paginatedResult ? paginatedResult.nextCursor : undefined}
                            prevCursor={'prevCursor' in paginatedResult ? paginatedResult.prevCursor : undefined}
                            hasNextPage={'hasNextPage' in paginatedResult ? paginatedResult.hasNextPage : undefined}
                            hasPrevPage={'hasPrevPage' in paginatedResult ? paginatedResult.hasPrevPage : undefined}
                        />
                    </Suspense>
                </>
            )}
        </div>
    );

    return (
        <>
            {/* Inject v2 map data into context for PersistentMapWrapper to consume */}
            {/* PersistentMapWrapper (in SearchLayoutView) reads this via SearchV2DataContext */}
            {v2MapData && <V2MapDataSetter data={v2MapData} />}
            {listContent}
        </>
    );
}
