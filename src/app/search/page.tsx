import { auth } from '@/auth';
import { getListingsPaginated, getMapListings, getSavedListingIds, analyzeFilterImpact, MapListingData } from '@/lib/data';
import { isDataError } from '@/lib/errors';
import { Suspense } from 'react';
import DynamicMap from '@/components/DynamicMap';
import ListingCard from '@/components/listings/ListingCard';
import Pagination from '@/components/Pagination';
import SortSelect from '@/components/SortSelect';
import SaveSearchButton from '@/components/SaveSearchButton';
import ZeroResultsSuggestions from '@/components/ZeroResultsSuggestions';
import { SearchErrorBanner } from '@/components/SearchErrorBanner';
import Link from 'next/link';
import { Search, Map, List, Clock } from 'lucide-react';
import SearchViewToggle from '@/components/SearchViewToggle';
import { headers } from 'next/headers';
import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';
import { parseSearchParams } from '@/lib/search-params';

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

    const { q, filterParams, requestedPage, sortOption } = parseSearchParams(rawParams);

    // Critical data - let errors bubble up to error boundary
    const paginatedResult = await getListingsPaginated({ ...filterParams, page: requestedPage, limit: ITEMS_PER_PAGE });

    // Non-critical data - graceful degradation with Promise.allSettled
    const [mapResult, savedResult] = await Promise.allSettled([
        getMapListings(filterParams), // Optimized for map - SQL-level bounds, minimal fields, LIMIT 200
        userId ? getSavedListingIds(userId) : Promise.resolve([])
    ]);

    // Handle map data with graceful fallback
    let mapListings: MapListingData[] = [];
    let mapError: { message: string; retryable: boolean } | null = null;
    if (mapResult.status === 'fulfilled') {
        mapListings = mapResult.value;
    } else {
        if (isDataError(mapResult.reason)) {
            mapResult.reason.log({ route: '/search', phase: 'mapListings' });
            mapError = {
                message: 'Map data temporarily unavailable',
                retryable: mapResult.reason.retryable
            };
        } else {
            mapError = { message: 'Map data temporarily unavailable', retryable: true };
        }
    }

    // Handle saved listings with graceful fallback
    const savedListingIds = savedResult.status === 'fulfilled' ? savedResult.value : [];

    const { items: listings, total, totalPages, page: currentPage } = paginatedResult;

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

    const mapContent = (
        <div className="relative h-full">
            {mapError && (
                <div className="absolute top-4 left-4 right-4 z-10">
                    <SearchErrorBanner
                        message={mapError.message}
                        retryable={mapError.retryable}
                    />
                </div>
            )}
            <DynamicMap listings={mapListings} />
        </div>
    );

    return (
        <div className="h-screen-safe flex flex-col bg-white dark:bg-zinc-950 overflow-hidden pt-20">
            <SearchViewToggle mapComponent={mapContent}>
                {listContent}
            </SearchViewToggle>
        </div>
    );
}
