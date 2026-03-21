import {
  getListingsPaginated,
  PaginatedResult,
  PaginatedResultHybrid,
  ListingData,
} from "@/lib/data";
import SortSelect from "@/components/SortSelect";
import SaveSearchButton from "@/components/SaveSearchButton";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  parseSearchParams,
  buildRawParamsFromSearchParams,
} from "@/lib/search-params";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { V1PathResetSetter } from "@/components/search/V1PathResetSetter";
import { SearchResultsLoadingWrapper } from "@/components/search/SearchResultsLoadingWrapper";
import { AppliedFilterChips } from "@/components/filters/AppliedFilterChips";
import { CategoryBar } from "@/components/search/CategoryBar";
import { RecommendedFilters } from "@/components/search/RecommendedFilters";
import { features } from "@/lib/env";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { sanitizeErrorMessage } from "@/lib/logger";
import type { Metadata } from "next";

type SearchPageSearchParams = {
  q?: string;
  minPrice?: string;
  maxPrice?: string;
  amenities?: string | string[];
  moveInDate?: string;
  leaseDuration?: string;
  houseRules?: string | string[];
  languages?: string | string[];
  roomType?: string;
  minSlots?: string;
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
};

interface SearchPageProps {
  searchParams: Promise<SearchPageSearchParams>;
}

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const rawParams = await searchParams;
  const { q, filterParams } = parseSearchParams(rawParams);
  const hasPagination = Boolean(rawParams.page || rawParams.cursor);
  const activeFilterCount = [
    filterParams.minPrice !== undefined,
    filterParams.maxPrice !== undefined,
    Boolean(filterParams.roomType),
    Boolean(filterParams.moveInDate),
    Boolean(filterParams.leaseDuration),
    (filterParams.amenities?.length ?? 0) > 0,
    (filterParams.houseRules?.length ?? 0) > 0,
    (filterParams.languages?.length ?? 0) > 0,
    Boolean(filterParams.genderPreference),
    Boolean(filterParams.householdGender),
    Boolean(filterParams.bounds),
  ].filter(Boolean).length;
  const isHighlyFiltered = activeFilterCount >= 3;
  const shouldNoIndex = hasPagination || isHighlyFiltered;

  const title = q
    ? `Rooms for rent in ${q} | Roomshare`
    : "Find Rooms & Roommates | Roomshare";

  const filterSummary: string[] = [];
  if (
    filterParams.minPrice !== undefined ||
    filterParams.maxPrice !== undefined
  ) {
    const minPrice =
      filterParams.minPrice !== undefined
        ? `$${Math.round(filterParams.minPrice)}`
        : "any";
    const maxPrice =
      filterParams.maxPrice !== undefined
        ? `$${Math.round(filterParams.maxPrice)}`
        : "any";
    filterSummary.push(`Price: ${minPrice}-${maxPrice}`);
  }
  if (filterParams.roomType) {
    filterSummary.push(`Room type: ${filterParams.roomType}`);
  }

  const baseDescription = `Browse ${q ? `${q} ` : ""}room listings on Roomshare.`;
  const description =
    `${baseDescription}${filterSummary.length > 0 ? ` ${filterSummary.join(" · ")}` : ""}`.substring(
      0,
      160
    );

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: shouldNoIndex
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    alternates: {
      canonical: `/search${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawParams = await searchParams;

  const {
    q,
    filterParams,
    requestedPage,
    sortOption,
    boundsRequired,
    browseMode,
  } = parseSearchParams(rawParams);

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
              To search for &ldquo;{q}&rdquo;, please select a location from the
              dropdown suggestions. This helps us find relevant listings in your
              area.
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
  let paginatedResult:
    | PaginatedResult<ListingData>
    | PaginatedResultHybrid<ListingData>
    | undefined;
  let v2NextCursor: string | null = null;

  // Check if v2 is enabled via feature flag OR query param override (?v2=1)
  // P0-7 FIX: Only allow v2 override in non-production (prevents feature flag bypass)
  const v2Override =
    process.env.NODE_ENV !== "production" &&
    (rawParams.v2 === "1" || rawParams.v2 === "true");
  const useV2Search = features.searchV2 || v2Override;

  // Try v2 orchestration if enabled
  if (useV2Search) {
    try {
      // Build raw params for v2 service (handles repeated params properly)
      const rawParamsForV2 = buildRawParamsFromSearchParams(
        new URLSearchParams(
          Object.entries(rawParams).flatMap(([key, value]) =>
            Array.isArray(value)
              ? value.map((v) => [key, v])
              : value
                ? [[key, value]]
                : []
          )
        )
      );

      // P0 FIX: Add timeout protection to prevent SSR hangs
      // V1 fallback (catch block below) IS the retry mechanism — no withRetry needed
      const v2Result = await withTimeout(
        executeSearchV2({
          rawParams: rawParamsForV2,
          limit: DEFAULT_PAGE_SIZE,
          includeMap: false,
        }),
        DEFAULT_TIMEOUTS.DATABASE,
        "SSR-executeSearchV2"
      );

      // V2 returned valid data - use it
      if (v2Result.response && v2Result.paginatedResult) {
        // V2 succeeded - use its data
        usedV2 = true;
        paginatedResult = v2Result.paginatedResult;
        v2NextCursor = v2Result.response.list.nextCursor ?? null;
      } else if (v2Result.error) {
        // V2 returned error without throwing - log it before falling through to V1
        const sanitized = sanitizeErrorMessage(v2Result.error);
        console.warn("[search/page] V2 returned error:", sanitized);
      }
    } catch (err) {
      // V2 failed - will fall back to v1 below
      const sanitized = sanitizeErrorMessage(err);
      console.warn(
        "[search/page] V2 orchestration failed, falling back to v1:",
        {
          error: sanitized,
        }
      );
    }
  }

  // V1 fallback path (when v2 disabled or failed)
  // Note: Map data is fetched by PersistentMapWrapper independently via /api/map-listings
  if (!usedV2) {
    // P0 FIX: Add timeout protection to V1 fallback to prevent indefinite hangs
    // Critical data - let errors bubble up to error boundary
    paginatedResult = await withTimeout(
      getListingsPaginated({
        ...filterParams,
        page: requestedPage,
        limit: DEFAULT_PAGE_SIZE,
      }),
      DEFAULT_TIMEOUTS.DATABASE,
      "v1-search-fallback"
    );
  }

  // Ensure paginatedResult is defined (should always be set by v2 or v1 path)
  if (!paginatedResult) {
    throw new Error("Failed to fetch search results");
  }

  const { items: listings, total: rawTotal } = paginatedResult;
  // IMPORTANT: Keep null distinct from 0 - null means "unknown count (>100 results)"
  // whereas 0 means "confirmed zero results"
  const total = rawTotal;

  // Only show zero-results UI when we have confirmed zero results (total === 0)
  // Not when total is null (unknown count, >100 results)
  const hasConfirmedZeroResults = total !== null && total === 0;

  // Build search params string for client-side "Load more" fetches
  // Include all filter/sort params but NOT cursor/page (those are managed client-side)
  const apiParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (["cursor", "cursorStack", "pageNumber", "page", "v2"].includes(key))
      continue;
    if (Array.isArray(value)) {
      value.forEach((v) => apiParams.append(key, v));
    } else if (value) {
      apiParams.set(key, value);
    }
  }
  const searchParamsString = apiParams.toString();

  // Extract nextCursor: prefer V2 response cursor, fallback to paginatedResult for keyset path
  const initialNextCursor =
    v2NextCursor ??
    ("nextCursor" in paginatedResult
      ? (paginatedResult.nextCursor ?? null)
      : null);

  const listContent = (
    <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
      <CategoryBar />
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <RecommendedFilters />
        <AppliedFilterChips currentCount={total} />

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 md:mb-10">
          <div className="flex-1">
            <h1
              id="search-results-heading"
              tabIndex={-1}
              className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white !outline-none mb-2"
            >
              {total === null ? "100+" : total}{" "}
              {total === 1 ? "place" : "places"} {q ? `in "${q}"` : "available"}
            </h1>
            <p className="text-sm md:text-base text-zinc-500 dark:text-zinc-400 font-light max-w-2xl">
              Find the perfect sanctuary. Curated spaces and compatible people.
            </p>
            {browseMode && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                Showing top listings. Select a location for more results.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start">
            <SaveSearchButton />
            <SortSelect currentSort={sortOption} />
          </div>
        </div>

        <SearchResultsClient
          key={searchParamsString}
          initialListings={listings}
          initialNextCursor={initialNextCursor}
          initialTotal={total}
          savedListingIds={[]}
          searchParamsString={searchParamsString}
          filterParams={filterParams}
          query={q ?? ""}
          browseMode={browseMode}
          hasConfirmedZeroResults={hasConfirmedZeroResults}
          filterSuggestions={[]}
        />
      </div>
    </div>
  );

  return (
    <>
      {/* Keep the initial HTML list-first and let the persistent map fetch independently */}
      <V1PathResetSetter />
      {/* Wrap results with loading indicator for filter transitions */}
      <SearchResultsLoadingWrapper>{listContent}</SearchResultsLoadingWrapper>
    </>
  );
}
