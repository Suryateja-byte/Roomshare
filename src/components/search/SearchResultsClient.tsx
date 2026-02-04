"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import ListingCard from "@/components/listings/ListingCard";
import ZeroResultsSuggestions from "@/components/ZeroResultsSuggestions";
import SuggestedSearches from "@/components/search/SuggestedSearches";
import { fetchMoreListings } from "@/app/search/actions";
import { TotalPriceToggle } from "@/components/search/TotalPriceToggle";
import { SplitStayCard } from "@/components/search/SplitStayCard";
import { findSplitStays } from "@/lib/search/split-stay";
import type { ListingData, FilterSuggestion } from "@/lib/data";

/**
 * Maximum accumulated listings before showing a "continue" link.
 * Prevents excessive DOM size on low-end devices.
 */
const MAX_ACCUMULATED = 60;

interface SearchResultsClientProps {
  initialListings: ListingData[];
  initialNextCursor: string | null;
  initialTotal: number | null;
  savedListingIds: string[];
  /** Serialized search params for the /api/search/v2 fetch (filters + sort, no cursor/page) */
  searchParamsString: string;
  query: string;
  browseMode: boolean;
  hasConfirmedZeroResults: boolean;
  filterSuggestions: FilterSuggestion[];
  sortOption: string;
}

export function SearchResultsClient({
  initialListings,
  initialNextCursor,
  initialTotal,
  savedListingIds,
  searchParamsString,
  query,
  browseMode,
  hasConfirmedZeroResults,
  filterSuggestions,
  sortOption,
}: SearchResultsClientProps) {
  const [extraListings, setExtraListings] = useState<ListingData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialNextCursor,
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showTotalPrice, setShowTotalPrice] = useState(false);

  // Hydrate showTotalPrice from sessionStorage after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('showTotalPrice');
      if (stored) setShowTotalPrice(JSON.parse(stored));
    } catch {
      // sessionStorage unavailable or invalid JSON
    }
  }, []);
  // Track all seen IDs for deduplication (initialized with SSR listings)
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialListings.map((l) => l.id)),
  );

  const allListings = [...initialListings, ...extraListings];
  const reachedCap = allListings.length >= MAX_ACCUMULATED;

  // Derive estimatedMonths from moveInDate/moveOutDate, falling back to leaseDuration
  const estimatedMonths = useMemo(() => {
    const sp = new URLSearchParams(searchParamsString);
    const moveIn = sp.get('moveInDate');
    const moveOut = sp.get('moveOutDate');
    if (moveIn && moveOut) {
      const start = new Date(moveIn);
      const end = new Date(moveOut);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        const diffMs = end.getTime() - start.getTime();
        const months = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
        return months;
      }
    }
    const ld = sp.get('leaseDuration');
    if (!ld) return 1;
    const match = ld.match(/^(\d+)\s+months?$/i);
    return match ? parseInt(match[1], 10) : 1;
  }, [searchParamsString]);

  // Compute split stay pairs for long durations (6+ months)
  const splitStayPairs = useMemo(
    () => findSplitStays(allListings, estimatedMonths),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allListings.length, estimatedMonths],
  );

  // Parse searchParamsString into raw params for the server action (once)
  const rawParamsRef = useRef<Record<string, string | string[] | undefined> | null>(null);
  if (!rawParamsRef.current) {
    const params: Record<string, string | string[] | undefined> = {};
    const sp = new URLSearchParams(searchParamsString);
    for (const [key, value] of sp.entries()) {
      const existing = params[key];
      if (existing) {
        params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        params[key] = value;
      }
    }
    rawParamsRef.current = params;
  }

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    setLoadError(null);
    performance.mark('load-more-start');

    try {
      const result = await fetchMoreListings(nextCursor, rawParamsRef.current!);
      performance.mark('load-more-end');
      performance.measure('load-more', 'load-more-start', 'load-more-end');

      // Deduplicate by ID
      const dedupedItems = result.items.filter((item) => {
        if (seenIdsRef.current.has(item.id)) return false;
        seenIdsRef.current.add(item.id);
        return true;
      });

      setExtraListings((prev) => [...prev, ...dedupedItems]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load more results",
      );
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore]);

  const total = initialTotal;

  return (
    <div id="search-results" tabIndex={-1}>
      {/* Screen reader announcement for search results */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {hasConfirmedZeroResults
          ? `No listings found${query ? ` for "${query}"` : ""}`
          : total === null
            ? `Found more than 100 listings${query ? ` for "${query}"` : ""}`
            : `Found ${total} ${total === 1 ? "listing" : "listings"}${query ? ` for "${query}"` : ""}`}
      </div>

      {hasConfirmedZeroResults ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-20 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl sm:rounded-3xl bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white dark:bg-zinc-800 flex items-center justify-center shadow-sm mb-4">
            <Search className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white mb-2">
            No matches found
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-xs text-center px-4">
            We couldn&apos;t find any listings{" "}
            {query ? `for "${query}"` : ""}.
          </p>

          {/* Smart filter suggestions */}
          {filterSuggestions.length > 0 ? (
            <div className="w-full max-w-sm px-4 mt-4">
              <Suspense fallback={null}>
                <ZeroResultsSuggestions
                  suggestions={filterSuggestions}
                  query={query}
                />
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
          {/* Suggested searches when browsing without a query */}
          {browseMode && !query && <SuggestedSearches />}

          {/* Price toggle + result count header */}
          {allListings.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {total !== null
                  ? `${total} ${total === 1 ? 'place' : 'places'}${query ? ` in ${query}` : ''}`
                  : `100+ places${query ? ` in ${query}` : ''}`}
              </p>
              <TotalPriceToggle showTotal={showTotalPrice} onToggle={setShowTotalPrice} />
            </div>
          )}

          <div role="feed" aria-label="Search results" className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
            {allListings.map((listing, index) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isSaved={savedListingIds.includes(listing.id)}
                priority={index < 4}
                showTotalPrice={showTotalPrice}
                estimatedMonths={estimatedMonths}
              />
            ))}
          </div>

          {/* Split stay suggestions for long durations */}
          {splitStayPairs.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Split your stay
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {splitStayPairs.map((pair) => (
                  <SplitStayCard key={`${pair.first.id}-${pair.second.id}`} pair={pair} />
                ))}
              </div>
            </div>
          )}

          {/* Load more section with progress indicator */}
          {nextCursor && !reachedCap && (
            <div className="flex flex-col items-center mt-8 mb-4 gap-2">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Showing {allListings.length} of {total !== null ? `~${total}` : '100+'} listings
              </p>
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
                aria-label={isLoadingMore ? "Loading more results" : `Show more places. Currently showing ${allListings.length}${total !== null ? ` of ${total}` : ''} listings`}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white text-sm font-medium transition-colors disabled:opacity-50 touch-target"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Loading…
                  </>
                ) : (
                  "Show more places"
                )}
              </button>
            </div>
          )}

          {/* Cap reached — nudge user to refine */}
          {reachedCap && nextCursor && (
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400 mt-6">
              Showing {allListings.length} results. Refine your filters to
              narrow down.
            </p>
          )}

          {/* Load error */}
          {loadError && (
            <div className="flex justify-center mt-4">
              <p className="text-sm text-red-600 dark:text-red-400">
                {loadError}{" "}
                <button
                  onClick={handleLoadMore}
                  className="underline hover:no-underline"
                >
                  Try again
                </button>
              </p>
            </div>
          )}

          {/* End of results indicator */}
          {!nextCursor && allListings.length > 0 && extraListings.length > 0 && (
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500 mt-8">
              You&apos;ve seen all {allListings.length} results
            </p>
          )}

          {/* Contextual footer */}
          {allListings.length > 0 && (
            <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 mt-6 pb-4">
              {total === null ? '100+' : total} stays{query ? ` in ${query}` : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}
