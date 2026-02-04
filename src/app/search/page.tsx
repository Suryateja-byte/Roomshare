import { auth } from '@/auth';
import { getListingsPaginated, getSavedListingIds, analyzeFilterImpact, PaginatedResult, PaginatedResultHybrid, ListingData } from '@/lib/data';
import SortSelect from '@/components/SortSelect';
import SaveSearchButton from '@/components/SaveSearchButton';
import { SearchResultsClient } from '@/components/search/SearchResultsClient';
import Link from 'next/link';
import { Search, Clock } from 'lucide-react';
import { headers } from 'next/headers';
import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';
import { parseSearchParams, buildRawParamsFromSearchParams } from '@/lib/search-params';
import { executeSearchV2 } from '@/lib/search/search-v2-service';
import { V2MapDataSetter } from '@/components/search/V2MapDataSetter';
import { V1PathResetSetter } from '@/components/search/V1PathResetSetter';
import { SearchResultsLoadingWrapper } from '@/components/search/SearchResultsLoadingWrapper';
import { AppliedFilterChips } from '@/components/filters/AppliedFilterChips';
import { CategoryBar } from '@/components/search/CategoryBar';
import { RecommendedFilters } from '@/components/search/RecommendedFilters';
import type { V2MapData } from '@/contexts/SearchV2DataContext';
import { features } from '@/lib/env';
import { preload } from 'react-dom';
import { withTimeout, DEFAULT_TIMEOUTS } from '@/lib/timeout-wrapper';

const ITEMS_PER_PAGE = 12;

// P2-FIX (#141): Helper for retry with exponential backoff for transient V2 search failures
// Single retry is sufficient - multiple retries would delay SSR too much
async function withRetry<T>(
    fn: () => Promise<T>,
    retries: number = 1,
    baseDelayMs: number = 200
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            // Don't retry on last attempt
            if (attempt < retries) {
                // Exponential backoff: 200ms, 400ms, etc.
                await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
            }
        }
    }
    throw lastError;
}

// P2-2: Server-side preload hints for LCP optimization
// Must match ListingCard.tsx PLACEHOLDER_IMAGES for consistent fallback behavior
const PLACEHOLDER_IMAGES = [
    "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1484154218962-a1c002085d2f?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1502005229766-528352261b79?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80"
];

// Helper to get first image URL for a listing (matches ListingCard logic)
function getFirstImageUrl(listing: { id: string; images?: string[] }): string {
    if (listing.images && listing.images.length > 0) {
        return listing.images[0];
    }
    // Deterministic placeholder selection based on listing ID
    const placeholderIndex = listing.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % PLACEHOLDER_IMAGES.length;
    return PLACEHOLDER_IMAGES[placeholderIndex];
}

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

    const { q, filterParams, requestedPage, sortOption, boundsRequired, browseMode } = parseSearchParams(rawParams);

    // Fetch saved listings in parallel (non-blocking)
    const savedPromise = userId ? getSavedListingIds(userId) : Promise.resolve([]);

    // Early return for unbounded searches - check BEFORE any search attempt
    // This ensures friendly UX regardless of V2/V1 path or failures
    if (boundsRequired) {
        return (
            <>
                {/* P2b Fix: Reset v2 context state on bounds-required path.
                    Without this, isV2Enabled stays true from a previous v2 search,
                    causing PersistentMapWrapper's race guard to loop forever. */}
                <V1PathResetSetter />
                <div className="px-4 sm:px-6 py-8 sm:py-12 max-w-[840px] mx-auto">
                    <div className="text-center py-12">
                        <div className="w-16 h-16 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                            <Search className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">
                            Please select a location
                        </h1>
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
            </>
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

            // P0 FIX: Add timeout protection to prevent SSR hangs
            // P2-FIX (#141): Add single retry for transient V2 failures before falling back to V1
            const v2Result = await withRetry(
                () => withTimeout(
                    executeSearchV2({
                        rawParams: rawParamsForV2,
                        limit: ITEMS_PER_PAGE,
                    }),
                    DEFAULT_TIMEOUTS.DATABASE,
                    'SSR-executeSearchV2'
                ),
                1, // Single retry
                200 // 200ms initial delay
            );

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
            } else if (v2Result.error) {
                // V2 returned error without throwing - log it before falling through to V1
                console.warn('[search/page] V2 returned error:', v2Result.error);
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
        // P0 FIX: Add timeout protection to V1 fallback to prevent indefinite hangs
        // Critical data - let errors bubble up to error boundary
        paginatedResult = await withTimeout(
            getListingsPaginated({ ...filterParams, page: requestedPage, limit: ITEMS_PER_PAGE }),
            DEFAULT_TIMEOUTS.DATABASE,
            'v1-search-fallback'
        );
    }

    // Handle saved listings result
    const savedListingIds = await savedPromise.catch(() => [] as string[]);

    // Ensure paginatedResult is defined (should always be set by v2 or v1 path)
    if (!paginatedResult) {
        throw new Error('Failed to fetch search results');
    }

    const { items: listings, total: rawTotal } = paginatedResult;
    // IMPORTANT: Keep null distinct from 0 - null means "unknown count (>100 results)"
    // whereas 0 means "confirmed zero results"
    const total = rawTotal;

    // Only show zero-results UI when we have confirmed zero results (total === 0)
    // Not when total is null (unknown count, >100 results)
    const hasConfirmedZeroResults = total !== null && total === 0;

    // Analyze filter impact only when there are confirmed zero results
    const filterSuggestions = hasConfirmedZeroResults ? await analyzeFilterImpact(filterParams) : [];

    // P2-2: Preload first 4 listing images for LCP optimization
    // This emits <link rel="preload" as="image"> in the server-rendered HTML
    // Only preload when we have results to display
    if (listings.length > 0) {
        listings.slice(0, 4).forEach((listing) => {
            const imageUrl = getFirstImageUrl(listing);
            preload(imageUrl, { as: 'image' });
        });
    }

    // Build search params string for client-side "Load more" fetches
    // Include all filter/sort params but NOT cursor/page (those are managed client-side)
    const apiParams = new URLSearchParams();
    for (const [key, value] of Object.entries(rawParams)) {
        if (['cursor', 'cursorStack', 'pageNumber', 'page', 'v2'].includes(key)) continue;
        if (Array.isArray(value)) {
            value.forEach(v => apiParams.append(key, v));
        } else if (value) {
            apiParams.set(key, value);
        }
    }
    const searchParamsString = apiParams.toString();

    // Extract nextCursor from paginated result
    const initialNextCursor = 'nextCursor' in paginatedResult ? (paginatedResult.nextCursor ?? null) : null;

    const listContent = (
        <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
            <CategoryBar />
            <div className="px-4 sm:px-6 pt-4 sm:pt-6">
            <RecommendedFilters />
            <AppliedFilterChips currentCount={total} />

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
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
                    {browseMode && (
                        <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                            Showing top listings. Select a location for more results.
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    <SaveSearchButton />
                    <SortSelect currentSort={sortOption} />
                </div>
            </div>

            <SearchResultsClient
                key={searchParamsString}
                initialListings={listings}
                initialNextCursor={initialNextCursor}
                initialTotal={total}
                savedListingIds={savedListingIds}
                searchParamsString={searchParamsString}
                query={q ?? ""}
                browseMode={browseMode}
                hasConfirmedZeroResults={hasConfirmedZeroResults}
                filterSuggestions={filterSuggestions}
                sortOption={sortOption}
            />
            </div>
        </div>
    );

    return (
        <>
            {/* Inject map data context for PersistentMapWrapper to consume */}
            {/* V2MapDataSetter: signals v2 mode active, injects v2 map data */}
            {/* V1PathResetSetter: signals v1 mode active, resets stale v2 state */}
            {v2MapData ? (
                <V2MapDataSetter data={v2MapData} />
            ) : (
                <V1PathResetSetter />
            )}
            {/* Wrap results with loading indicator for filter transitions */}
            <SearchResultsLoadingWrapper>
                {listContent}
            </SearchResultsLoadingWrapper>
        </>
    );
}
