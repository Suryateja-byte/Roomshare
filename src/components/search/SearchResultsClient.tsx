"use client";

import {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  Fragment,
} from "react";
import { useSearchParams } from "next/navigation";
import { safeMark, safeMeasure } from "@/lib/perf";
import { Search, Loader2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import ListingCard from "@/components/listings/ListingCard";
import { ListingCardErrorBoundary } from "@/components/search/ListingCardErrorBoundary";
import NearMatchSeparator from "@/components/listings/NearMatchSeparator";
import ZeroResultsSuggestions from "@/components/ZeroResultsSuggestions";
import SuggestedSearches from "@/components/search/SuggestedSearches";
import SaveSearchButton from "@/components/SaveSearchButton";
import { fetchMoreListings } from "@/app/search/actions";
import { TotalPriceToggle } from "@/components/search/TotalPriceToggle";
import { clearAllFilters } from "@/components/filters/filter-chip-utils";
import { SplitStayCard } from "@/components/search/SplitStayCard";
import { ExpandSearchSuggestions } from "@/components/search/ExpandSearchSuggestions";
import { findSplitStays } from "@/lib/search/split-stay";
import { getFilterSuggestions } from "@/app/actions/filter-suggestions";
import { useMobileSearch } from "@/contexts/MobileSearchContext";
import { useSearchTestScenario } from "@/contexts/SearchTestScenarioContext";
import type { ListingData, FilterSuggestion } from "@/lib/data";
import type { FilterParams } from "@/lib/search-types";
import {
  getSearchQueryHash,
  SEARCH_RESPONSE_VERSION,
  type SearchListPayload,
  type SearchListState,
  type SearchResponseMeta,
} from "@/lib/search/search-response";
import {
  normalizeSearchQuery,
  serializeSearchQuery,
} from "@/lib/search/search-query";
import { getScenarioHeaderValue } from "@/lib/search/testing/search-scenarios";

/**
 * Maximum accumulated listings before showing a "continue" link.
 * Prevents excessive DOM size on low-end devices.
 */
const MAX_ACCUMULATED = 60;

function formatMobileResultsLabel(
  total: number | null,
  hasZeroResults: boolean,
  location?: string
): string {
  const suffix = location ? ` in ${location}` : "";
  if (hasZeroResults) return `0 places${suffix}`;
  if (total === null) return `100+ places${suffix}`;
  return `${total} ${total === 1 ? "place" : "places"}${suffix}`;
}

interface SearchResultsClientProps {
  initialListings: ListingData[];
  initialNextCursor: string | null;
  initialTotal: number | null;
  savedListingIds: string[];
  /** Serialized search params for the /api/search/v2 fetch (filters + sort, no cursor/page) */
  searchParamsString: string;
  filterParams: FilterParams;
  query: string;
  vibeQuery?: string;
  browseMode: boolean;
  hasConfirmedZeroResults: boolean;
  filterSuggestions: FilterSuggestion[];
  /** Description of near-match expansion (e.g., "Showing rooms within $200 of your budget") */
  nearMatchExpansion?: string;
  /** Subtle advisory when vibe search falls back to broader area matches */
  vibeAdvisory?: string;
  initialResponseMeta?: SearchResponseMeta;
  initialStateKind?: SearchListState["kind"];
  /** When true, URL changes trigger client-side fetch instead of SSR */
  clientSideSearchEnabled?: boolean;
}

export function SearchResultsClient({
  initialListings,
  initialNextCursor,
  initialTotal,
  savedListingIds,
  searchParamsString,
  filterParams,
  query,
  vibeQuery,
  browseMode,
  hasConfirmedZeroResults,
  filterSuggestions,
  nearMatchExpansion,
  vibeAdvisory,
  initialResponseMeta,
  initialStateKind,
  clientSideSearchEnabled = false,
}: SearchResultsClientProps) {
  const resolvedInitialResponseMeta = useMemo(
    () =>
      initialResponseMeta ?? {
        queryHash: getSearchQueryHash(
          normalizeSearchQuery(new URLSearchParams(searchParamsString))
        ),
        backendSource: "v1-fallback",
        responseVersion: SEARCH_RESPONSE_VERSION,
      },
    [initialResponseMeta, searchParamsString]
  );
  const resolvedInitialStateKind =
    initialStateKind ?? (hasConfirmedZeroResults ? "zero-results" : "ok");
  const { setSearchResultsLabel } = useMobileSearch();
  const testScenario = useSearchTestScenario();
  const [isHydrated, setIsHydrated] = useState(false);
  const [extraListings, setExtraListings] = useState<ListingData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialNextCursor
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingRef = useRef(false);
  // F2 FIX: Ref for total count avoids allListings in handleLoadMore deps
  const totalCountRef = useRef(initialListings.length);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const [loadMoreAnnouncement, setLoadMoreAnnouncement] = useState("");
  const [showTotalPrice, setShowTotalPrice] = useState(false);
  // Effective value: suppress total price display until sessionStorage is read.
  // isHydrated and showTotalPrice are set in the same batched useEffect,
  // so they update in one render — no intermediate flicker.
  const effectiveShowTotalPrice = isHydrated && showTotalPrice;
  const [resolvedSavedListingIds, setResolvedSavedListingIds] =
    useState(savedListingIds);
  const [resolvedFilterSuggestions, setResolvedFilterSuggestions] =
    useState(filterSuggestions);
  const [responseMeta, setResponseMeta] = useState(resolvedInitialResponseMeta);
  const [searchStateKind, setSearchStateKind] =
    useState<SearchListState["kind"]>(resolvedInitialStateKind);

  // Hydrate showTotalPrice from sessionStorage after mount to avoid hydration mismatch
  useEffect(() => {
    setIsHydrated(true);
    try {
      const stored = sessionStorage.getItem("showTotalPrice");
      if (stored) setShowTotalPrice(JSON.parse(stored));
    } catch {
      // sessionStorage unavailable or invalid JSON
    }
  }, []);
  // Track all seen IDs for deduplication (initialized with SSR listings)
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialListings.map((l) => l.id))
  );
  // Track which listing IDs have already had favorites fetched (#16)
  // Prevents refetching favorites for all IDs on every "Load More"
  const fetchedFavIdsRef = useRef<Set<string>>(new Set());

  // --- Client-side search fetch (when feature flag enabled) ---
  const [clientFetchedListings, setClientFetchedListings] = useState<
    ListingData[] | null
  >(null);
  const [clientFetchedTotal, setClientFetchedTotal] = useState<number | null>(
    null
  );
  const [clientFetchedNearMatch, setClientFetchedNearMatch] = useState<
    string | undefined
  >(undefined);
  const [clientFetchedVibeAdvisory, setClientFetchedVibeAdvisory] = useState<
    string | undefined
  >(undefined);
  const [isClientFetching, setIsClientFetching] = useState(false);
  const clientFetchAbortRef = useRef<AbortController | null>(null);
  const previousSearchParamsRef = useRef<string | null>(null);
  const latestQueryHashRef = useRef(resolvedInitialResponseMeta.queryHash);

  // Listen for URL search param changes (triggered by replaceState in Map.tsx)
  const currentSearchParams = useSearchParams();
  const currentSearchParamsString = useMemo(
    () => currentSearchParams.toString(),
    [currentSearchParams]
  );
  const currentNormalizedQuery = useMemo(
    () => normalizeSearchQuery(new URLSearchParams(currentSearchParamsString)),
    [currentSearchParamsString]
  );
  const canonicalSearchParamsString = useMemo(
    () =>
      serializeSearchQuery(currentNormalizedQuery, {
        includePagination: false,
      }).toString(),
    [currentNormalizedQuery]
  );
  const activeSearchParamsString = clientSideSearchEnabled
    ? canonicalSearchParamsString
    : searchParamsString;
  const currentQueryHash = useMemo(
    () => getSearchQueryHash(currentNormalizedQuery),
    [currentNormalizedQuery]
  );

  useEffect(() => {
    latestQueryHashRef.current = currentQueryHash;
  }, [currentQueryHash]);

  useEffect(() => {
    if (!clientSideSearchEnabled) return;

    // Skip the initial render — SSR data covers the first load
    if (previousSearchParamsRef.current === null) {
      previousSearchParamsRef.current = currentSearchParamsString;
      return;
    }

    // No change
    if (previousSearchParamsRef.current === currentSearchParamsString) return;
    previousSearchParamsRef.current = currentSearchParamsString;

    // Cancel any in-flight request
    clientFetchAbortRef.current?.abort();
    const controller = new AbortController();
    clientFetchAbortRef.current = controller;
    const requestQueryHash = currentQueryHash;

    setIsClientFetching(true);

    void (async () => {
      try {
        const response = await fetch(
          `/api/search/listings?${canonicalSearchParamsString}`,
          {
            signal: controller.signal,
            headers: {
              "x-search-query-hash": requestQueryHash,
              ...getScenarioHeaderValue(testScenario),
            },
          }
        );

        if (!response.ok) {
          // Non-OK response: silently degrade, SSR data remains visible
          setIsClientFetching(false);
          return;
        }

        const data = (await response.json()) as
          | SearchListState
          | {
              kind: "degraded";
              source: "v1-fallback" | "partial";
              data: SearchListPayload;
              meta: SearchResponseMeta;
            };

        if (
          controller.signal.aborted ||
          !("meta" in data) ||
          data.meta.queryHash !== requestQueryHash ||
          latestQueryHashRef.current !== requestQueryHash
        ) {
          return;
        }

        setResponseMeta(data.meta);
        setSearchStateKind(data.kind);

        if (data.kind === "location-required" || data.kind === "zero-results") {
          setClientFetchedListings([]);
          setClientFetchedTotal(0);
          setNextCursor(null);
          setClientFetchedNearMatch(undefined);
          setClientFetchedVibeAdvisory(undefined);
          setIsClientFetching(false);
          return;
        }

        if (data.kind === "rate-limited") {
          return;
        }

        // Replace listings in-place (no remount)
        setClientFetchedListings(data.data.items);
        setClientFetchedTotal(data.data.total);
        setClientFetchedNearMatch(data.data.nearMatchExpansion);
        setClientFetchedVibeAdvisory(data.data.vibeAdvisory);

        // Reset pagination state for new results
        setExtraListings([]);
        setNextCursor(data.data.nextCursor);
        seenIdsRef.current = new Set(data.data.items.map((l) => l.id));
        fetchedFavIdsRef.current = new Set();
        totalCountRef.current = data.data.items.length;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // Fetch failed: keep old listings visible, no crash
      } finally {
        if (!controller.signal.aborted) {
          setIsClientFetching(false);
        }
      }
    })();

    return () => controller.abort();
  }, [canonicalSearchParamsString, clientSideSearchEnabled, currentQueryHash, currentSearchParamsString]);

  // Use client-fetched data when available, otherwise fall back to SSR props
  const effectiveListings = clientFetchedListings ?? initialListings;
  const effectiveTotal = clientFetchedListings !== null ? clientFetchedTotal : initialTotal;
  const effectiveNearMatch = clientFetchedListings !== null ? clientFetchedNearMatch : nearMatchExpansion;
  const effectiveVibeAdvisory = clientFetchedListings !== null ? clientFetchedVibeAdvisory : vibeAdvisory;

  // Derive a stable fingerprint of the initial data to detect server-side changes
  const initialDataFingerprint = useMemo(
    () => initialListings.map((l) => l.id).join(","),
    [initialListings]
  );

  // Track the previous fingerprint to detect changes
  const prevFingerprintRef = useRef(initialDataFingerprint);

  // Reset pagination state when server data changes (e.g., browser back/forward)
  useEffect(() => {
    if (prevFingerprintRef.current !== initialDataFingerprint) {
      prevFingerprintRef.current = initialDataFingerprint;
      setExtraListings([]);
      setNextCursor(initialNextCursor);
      setLoadMoreAnnouncement("");
      seenIdsRef.current = new Set(initialListings.map((l) => l.id));
      fetchedFavIdsRef.current = new Set(); // Reset favorites tracking on new search
    }
  }, [initialDataFingerprint, initialNextCursor, initialListings]);

  useEffect(() => {
    setResponseMeta(resolvedInitialResponseMeta);
    setSearchStateKind(resolvedInitialStateKind);
  }, [resolvedInitialResponseMeta, resolvedInitialStateKind]);

  const allListings = useMemo(
    () => [...effectiveListings, ...extraListings],
    [effectiveListings, extraListings]
  );
  // F8 FIX: Stable string key for effects that depend on listing IDs, not array reference
  const allListingIdsKey = useMemo(
    () => allListings.map((l) => l.id).join(","),
    [allListings]
  );
  const reachedCap = allListings.length >= MAX_ACCUMULATED;

  // Near-match items are appended at the end by expandWithNearMatches
  const nearMatchCount = useMemo(
    () => allListings.filter((l) => l.isNearMatch).length,
    [allListings]
  );

  // O(1) lookup for saved listing IDs instead of O(n) .includes()
  const savedIdsSet = useMemo(
    () => new Set(resolvedSavedListingIds),
    [resolvedSavedListingIds]
  );

  // Derive estimatedMonths from moveInDate/moveOutDate, falling back to leaseDuration
  const estimatedMonths = useMemo(() => {
    const sp = new URLSearchParams(activeSearchParamsString);
    const moveIn = sp.get("moveInDate");
    const moveOut = sp.get("moveOutDate");
    if (moveIn && moveOut) {
      const start = new Date(moveIn);
      const end = new Date(moveOut);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
        const diffMs = end.getTime() - start.getTime();
        const months = Math.max(
          1,
          Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44))
        );
        return months;
      }
    }
    const ld = sp.get("leaseDuration");
    if (!ld) return 1;
    const match = ld.match(/^(\d+)\s+months?$/i);
    return match ? parseInt(match[1], 10) : 1;
  }, [activeSearchParamsString]);

  // Compute split stay pairs for long durations (6+ months)
  const splitStayPairs = useMemo(
    () => findSplitStays(allListings, estimatedMonths),
    [allListings, estimatedMonths]
  );

  // Parse searchParamsString into raw params for the server action.
  // Keep this in sync with URL updates so fetchMore uses current filters/bounds.
  const rawParams = useMemo(() => {
    const params: Record<string, string | string[] | undefined> = {};
    const sp = new URLSearchParams(activeSearchParamsString);
    for (const [key, value] of sp.entries()) {
      const existing = params[key];
      if (existing) {
        params[key] = Array.isArray(existing)
          ? [...existing, value]
          : [existing, value];
      } else {
        params[key] = value;
      }
    }
    return params;
  }, [activeSearchParamsString]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingRef.current) return;

    isLoadingRef.current = true;
    setIsLoadingMore(true);
    setLoadError(null);
    setIsDegraded(false);
    safeMark("load-more-start");

    try {
      const requestQueryHash = latestQueryHashRef.current;
      const result = await fetchMoreListings(
        nextCursor,
        rawParams,
        requestQueryHash,
        testScenario
      );

      if (
        result.meta?.queryHash &&
        (result.meta.queryHash !== requestQueryHash ||
          latestQueryHashRef.current !== requestQueryHash)
      ) {
        return;
      }

      // M14 FIX: Handle rate limit via discriminated field (not string matching)
      if (result.rateLimited) {
        setLoadError(
          "Too many requests — please wait 30 seconds and try again."
        );
        return;
      }

      // V2 unavailable — show error with working retry (cursor preserved for circuit breaker recovery)
      if (result.degraded) {
        setIsDegraded(true);
        setLoadError("Can't load more right now. Try again in a moment.");
        return;
      }

      safeMark("load-more-end");
      safeMeasure("load-more", "load-more-start", "load-more-end");
      setIsDegraded(false);

      // Defensive guard: ensure items is an array (protects against malformed server responses)
      const items = Array.isArray(result.items) ? result.items : [];

      // Deduplicate by ID
      const dedupedItems = items.filter((item) => {
        if (seenIdsRef.current.has(item.id)) return false;
        seenIdsRef.current.add(item.id);
        return true;
      });

      setExtraListings((prev) => {
        const next = [...prev, ...dedupedItems];
        // F2 FIX: Update ref inside setState for deterministic count
        totalCountRef.current = effectiveListings.length + next.length;
        return next;
      });
      setNextCursor(result.nextCursor);

      // Announce to screen readers (after state update)
      // F2 FIX: Use ref for count instead of stale allListings closure
      const newCount = totalCountRef.current;
      const totalLabel = effectiveTotal !== null ? ` of ~${effectiveTotal}` : "";
      setLoadMoreAnnouncement(
        `Loaded ${dedupedItems.length} more listing${dedupedItems.length === 1 ? "" : "s"}, showing ${newCount}${totalLabel}`
      );
    } catch (err) {
      const raw =
        err instanceof Error ? err.message : "Failed to load more results";
      const friendly =
        raw.includes("Rate limit") || raw.includes("Too many requests")
          ? "Too many requests — please wait 30 seconds and try again."
          : raw.includes("fetch") ||
              raw.includes("network") ||
              raw.includes("Failed to fetch")
            ? "Connection lost. Check your internet and try again."
            : "Failed to load more results. Please try again.";
      setLoadError(friendly);
    } finally {
      isLoadingRef.current = false;
      setIsLoadingMore(false);
    }
    // F2 FIX: Removed allListings dep — count read from totalCountRef instead
  }, [nextCursor, rawParams, effectiveTotal, effectiveListings.length]);

  const total = effectiveTotal;
  // When client-fetched data is active, derive zero-results from effective total
  const effectiveZeroResults =
    clientFetchedListings !== null
      ? effectiveTotal !== null && effectiveTotal === 0
      : hasConfirmedZeroResults;
  const mobileResultsLabel = useMemo(
    () => formatMobileResultsLabel(effectiveTotal, effectiveZeroResults, query),
    [effectiveTotal, effectiveZeroResults, query]
  );

  useEffect(() => {
    setSearchResultsLabel(mobileResultsLabel);

    return () => {
      setSearchResultsLabel(null);
    };
  }, [mobileResultsLabel, setSearchResultsLabel]);

  useEffect(() => {
    const allIds = allListings.map((listing) => listing.id);
    if (allIds.length === 0) {
      setResolvedSavedListingIds([]);
      return;
    }

    // Only fetch favorites for IDs we haven't fetched yet (#16)
    // This prevents refetching all 60 IDs on every "Load More"
    const newIds = allIds.filter((id) => !fetchedFavIdsRef.current.has(id));
    if (newIds.length === 0) {
      return; // All IDs already fetched — nothing to do
    }

    const controller = new AbortController();
    const idsParam = newIds.join(",");

    void (async () => {
      try {
        const response = await fetch(
          `/api/favorites?ids=${encodeURIComponent(idsParam)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { savedIds?: string[] };
        if (Array.isArray(data.savedIds)) {
          // Mark these IDs as fetched
          for (const id of newIds) {
            fetchedFavIdsRef.current.add(id);
          }
          // Merge new saved IDs with existing ones (no duplicates)
          setResolvedSavedListingIds((prev) => {
            const merged = new Set(prev);
            for (const id of data.savedIds!) {
              merged.add(id);
            }
            return Array.from(merged);
          });
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.debug("Failed to hydrate saved listings", error);
        }
      }
    })();

    return () => controller.abort();
    // F8 FIX: Use stable ID key instead of allListings array reference
    // Prevents unnecessary effect cycles when allListings recreates with same IDs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allListingIdsKey]);

  useEffect(() => {
    if (!hasConfirmedZeroResults) {
      setResolvedFilterSuggestions([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const suggestions = await getFilterSuggestions(filterParams);
        if (!cancelled) {
          setResolvedFilterSuggestions(suggestions);
        }
      } catch {
        // Network error or server action failure — silently degrade
        if (!cancelled) {
          setResolvedFilterSuggestions([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filterParams, hasConfirmedZeroResults]);

  return (
    <div
      id="search-results"
      tabIndex={-1}
      data-testid="search-shell"
      data-query-hash={responseMeta.queryHash}
      data-search-query-hash={responseMeta.queryHash}
      data-search-state={searchStateKind}
      data-backend-source={responseMeta.backendSource}
      data-search-backend-source={responseMeta.backendSource}
      data-response-version={responseMeta.responseVersion}
      data-search-response-version={responseMeta.responseVersion}
      className="!outline-none pb-24 md:pb-0"
    >
      {/* Screen reader announcement for search results */}
      <div
        data-testid="search-backend-source"
        className="sr-only"
        aria-hidden="true"
      >
        {responseMeta.backendSource}
      </div>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {effectiveZeroResults
          ? `No listings found${query ? ` for "${query}"` : ""}`
          : total === null
            ? `Found more than 100 listings${query ? ` for "${query}"` : ""}`
            : `Found ${total} ${total === 1 ? "listing" : "listings"}${query ? ` for "${query}"` : ""}`}
      </div>

      {/* Load-more announcement — separate from initial status to avoid re-announcing on mount */}
      <div role="log" aria-live="polite" aria-atomic="true" className="sr-only">
        {loadMoreAnnouncement}
      </div>

      {/* Client-side fetch announcement */}
      {isClientFetching && (
        <div role="status" aria-live="polite" className="sr-only">
          Updating search results
        </div>
      )}

      {effectiveZeroResults ? (
        <div
          data-testid="empty-state"
          className="flex flex-col items-center justify-center py-16 sm:py-24 border-2 border-dashed border-outline-variant/20 rounded-2xl sm:rounded-3xl bg-surface-canvas/50"
        >
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-surface-container-lowest flex items-center justify-center shadow-sm mb-4">
            <Search className="w-5 h-5 sm:w-6 sm:h-6 text-on-surface-variant" />
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-on-surface mb-2">
            No matches found
          </h2>
          <p className="text-on-surface-variant text-sm max-w-xs text-center px-4">
            Try adjusting your filters, expanding your price range, or searching
            a nearby area.
            {query ? ` No results for "${query}".` : ""}
          </p>

          {/* Smart filter suggestions */}
          {resolvedFilterSuggestions.length > 0 ? (
            <div className="w-full max-w-sm px-4 mt-4">
              <Suspense fallback={null}>
                <ZeroResultsSuggestions
                  suggestions={resolvedFilterSuggestions}
                  query={query}
                />
              </Suspense>
            </div>
          ) : (
            <Link
              href={`/search?${clearAllFilters(new URLSearchParams(activeSearchParamsString))}`}
              className="mt-6 px-4 py-2.5 rounded-full border border-outline-variant/20 bg-transparent hover:bg-surface-canvas text-on-surface text-sm font-medium transition-colors touch-target"
            >
              Clear all filters
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Suggested searches when browsing without a query */}
          {browseMode && !query && <SuggestedSearches />}

          {/* Price toggle */}
          {allListings.length > 0 && (
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="hidden text-sm text-on-surface-variant md:block">
                  {isClientFetching
                    ? "Updating..."
                    : total !== null
                      ? `${total} ${total === 1 ? "place" : "places"}${query ? ` in ${query}` : ""}`
                      : `100+ places${query ? ` in ${query}` : ""}`}
                </p>
                {vibeQuery ? (
                  <p className="mt-1 text-xs text-on-surface-variant/90">
                    Matching vibe: {vibeQuery}
                  </p>
                ) : null}
                {effectiveVibeAdvisory ? (
                  <p className="mt-2 inline-flex rounded-full bg-surface-container-high px-3 py-1 text-xs font-medium text-on-surface-variant">
                    {effectiveVibeAdvisory}
                  </p>
                ) : null}
              </div>
              {estimatedMonths > 1 && (
                <TotalPriceToggle
                  showTotal={effectiveShowTotalPrice}
                  onToggle={setShowTotalPrice}
                />
              )}
            </div>
          )}

          {/* Client-side fetch loading bar */}
          {isClientFetching && (
            <div className="h-[3px] bg-surface-container-high rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-primary rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite] motion-reduce:animate-none"
                style={{ width: "40%" }}
                role="progressbar"
                aria-label="Loading new search results"
              />
            </div>
          )}

          <h2 className="sr-only">Available listings</h2>
          <div
            role="feed"
            aria-label="Search results"
            aria-busy={isLoadingMore || isClientFetching}
            data-hydrated={isHydrated || undefined}
            className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-x-6 sm:gap-y-9 transition-opacity duration-200 ease-out motion-reduce:transition-none"
            style={isClientFetching ? { opacity: 0.6 } : undefined}
          >
            {allListings.map((listing, index) => {
              // Insert separator before the first near-match item
              const isFirstNearMatch =
                listing.isNearMatch &&
                (index === 0 || !allListings[index - 1]?.isNearMatch);

              return (
                <Fragment key={listing.id}>
                  {isFirstNearMatch && nearMatchCount > 0 && (
                    <>
                      <NearMatchSeparator nearMatchCount={nearMatchCount} />
                      {effectiveNearMatch && (
                        <p className="col-span-full text-sm text-amber-600 -mt-2 mb-2">
                          {effectiveNearMatch}
                        </p>
                      )}
                    </>
                  )}
                  <ListingCardErrorBoundary listingId={listing.id}>
                    <div
                      aria-setsize={total ?? -1}
                      aria-posinset={index + 1}
                      className="animate-card-entrance"
                      style={{
                        animationDelay: `${Math.min(index, 6) * 40}ms`,
                      }}
                    >
                      <ListingCard
                        listing={listing}
                        isSaved={savedIdsSet.has(listing.id)}
                        priority={index === 0}
                        showTotalPrice={effectiveShowTotalPrice}
                        estimatedMonths={estimatedMonths}
                      />
                    </div>
                  </ListingCardErrorBoundary>
                </Fragment>
              );
            })}
          </div>

          {/* Split stay suggestions for long durations */}
          {splitStayPairs.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-on-surface-variant mb-3">
                Split your stay
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {splitStayPairs.map((pair) => (
                  <ListingCardErrorBoundary
                    key={`${pair.first.id}-${pair.second.id}`}
                    listingId={`split-${pair.first.id}-${pair.second.id}`}
                  >
                    <SplitStayCard
                      pair={pair}
                      showTotalPrice={effectiveShowTotalPrice}
                      estimatedMonths={estimatedMonths}
                    />
                  </ListingCardErrorBoundary>
                ))}
              </div>
            </div>
          )}

          {/* Load more section with progress indicator */}
          {isHydrated && nextCursor && !reachedCap && !isDegraded && (
            <div className="flex flex-col items-center mt-8 mb-4 gap-2">
              <p className="text-xs text-on-surface-variant">
                Showing {allListings.length} of{" "}
                {total !== null ? `~${total}` : "100+"} listings
              </p>
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
                aria-label={
                  isLoadingMore
                    ? "Loading more results"
                    : `Show more places. Currently showing ${allListings.length}${total !== null ? ` of ${total}` : ""} listings`
                }
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-primary hover:bg-primary/90 text-on-primary text-sm font-medium transition-colors disabled:opacity-50 touch-target"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      aria-hidden="true"
                    />
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
            <p className="text-center text-sm text-on-surface-variant mt-6">
              Showing {allListings.length} results. Try adjusting your filters
              or zooming into a specific area to find more relevant listings.
            </p>
          )}

          {/* Load error */}
          {loadError && (
            <div className="flex justify-center mt-4" role="alert">
              <p className="text-sm text-red-600">
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
          {!nextCursor &&
            allListings.length > 0 &&
            extraListings.length > 0 && (
              <p className="text-center text-sm text-on-surface-variant mt-8">
                You&apos;ve seen all {allListings.length} results
              </p>
            )}

          {/* Expansion suggestions for sparse results (1-5 listings) */}
          {total !== null && total > 0 && total <= 5 && (
            <ExpandSearchSuggestions
              currentCount={total}
              searchParamsString={activeSearchParamsString}
            />
          )}

          {allListings.length > 0 && !effectiveZeroResults && isHydrated && !isLoadingMore && (
            <section
              aria-label="Save search"
              className="hidden md:flex mt-12 mb-4 relative overflow-hidden bg-surface-container-high/40 rounded-2xl p-8 flex-col sm:flex-row items-center justify-between gap-6 border border-outline-variant/20"
            >
              <div>
                <h3 className="text-lg font-display font-semibold text-on-surface mb-1">
                  Don&apos;t miss out
                </h3>
                <p className="text-sm text-on-surface-variant">
                  We add new spaces daily. Save this search to get notified first.
                </p>
              </div>
              <SaveSearchButton />
            </section>
          )}
        </>
      )}
    </div>
  );
}
