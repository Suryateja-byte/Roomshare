import { auth } from '@/auth';
import { getListingsPaginated, getListings, getSavedListingIds, SortOption } from '@/lib/data';
import { Suspense } from 'react';
import SearchForm from '@/components/SearchForm';
import MapComponent from '@/components/Map';
import ListingCard from '@/components/ListingCard';
import Pagination from '@/components/Pagination';
import SortSelect from '@/components/SortSelect';
import SaveSearchButton from '@/components/SaveSearchButton';
import Link from 'next/link';
import { Search, Map, List } from 'lucide-react';
import SearchViewToggle from '@/components/SearchViewToggle';

const ITEMS_PER_PAGE = 12;

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        minPrice?: string;
        maxPrice?: string;
        language?: string;
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
    const { q, minPrice, maxPrice, language, amenities, moveInDate, leaseDuration, houseRules, roomType, minLat, maxLat, minLng, maxLng, lat, lng, page, sort } = await searchParams;
    const session = await auth();
    const userId = session?.user?.id;
    const currentPage = page ? parseInt(page) : 1;

    const amenitiesList = typeof amenities === 'string' ? [amenities] : amenities;
    const houseRulesList = typeof houseRules === 'string' ? [houseRules] : houseRules;

    // Calculate bounds from either explicit bounds or from center coordinates
    let bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | undefined;

    if (minLat && maxLat && minLng && maxLng) {
        // Use explicit bounds from map movement
        bounds = {
            minLat: parseFloat(minLat),
            maxLat: parseFloat(maxLat),
            minLng: parseFloat(minLng),
            maxLng: parseFloat(maxLng)
        };
    } else if (lat && lng) {
        // Create bounds around the selected location (approximately 10km radius)
        const centerLat = parseFloat(lat);
        const centerLng = parseFloat(lng);
        const latOffset = 0.09; // ~10km in latitude
        const lngOffset = 0.12; // ~10km in longitude (varies by latitude)

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

    const filterParams = {
        query: q,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        language,
        amenities: amenitiesList,
        moveInDate,
        leaseDuration,
        houseRules: houseRulesList,
        roomType,
        bounds,
        sort: sortOption
    };

    const [paginatedResult, allListings, savedListingIds] = await Promise.all([
        getListingsPaginated({ ...filterParams, page: currentPage, limit: ITEMS_PER_PAGE }),
        getListings(filterParams), // For the map to show all listings
        userId ? getSavedListingIds(userId) : Promise.resolve([])
    ]);

    const { items: listings, total, totalPages } = paginatedResult;

    const listContent = (
        <div className="px-4 sm:px-6 py-4 sm:py-6 max-w-[840px] mx-auto pb-24 md:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-lg sm:text-xl font-semibold text-zinc-900 tracking-tight">
                        {total} {total === 1 ? 'place' : 'places'} {q ? `in "${q}"` : 'available'}
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Book a place that fits your lifestyle.
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3">
                    <SaveSearchButton />
                    <SortSelect currentSort={sortOption} />
                </div>
            </div>

            {total === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 sm:py-20 border-2 border-dashed border-zinc-100 rounded-2xl sm:rounded-3xl bg-zinc-50/50 ">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white flex items-center justify-center shadow-sm mb-4">
                        <Search className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-zinc-900 mb-2">No matches found</h3>
                    <p className="text-zinc-500 text-sm max-w-xs text-center mb-6 px-4">
                        We couldn't find any listings {q ? `for "${q}"` : ''}. Try changing your search area or removing filters.
                    </p>
                    <Link
                        href="/search"
                        className="px-4 py-2.5 rounded-full border border-zinc-200 bg-transparent hover:bg-zinc-50 text-zinc-900 text-sm font-medium transition-colors touch-target"
                    >
                        Clear all filters
                    </Link>
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
        <div className="h-screen-safe flex flex-col bg-white overflow-hidden">
            {/* Sticky Search Header */}
            <header className="sticky top-0 z-[900] w-full bg-white/80 backdrop-blur-xl border-b border-zinc-100 ">
                <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
                    <Suspense fallback={<div className="h-14 sm:h-16 w-full bg-zinc-100 animate-pulse rounded-full" />}>
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
