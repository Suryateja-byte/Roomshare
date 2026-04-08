import {
  getListingsPaginated,
  PaginatedResult,
  PaginatedResultHybrid,
  ListingData,
} from "@/lib/data";
import SortSelect from "@/components/SortSelect";
import SaveSearchButton from "@/components/SaveSearchButton";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import { SearchResultsErrorBoundary } from "@/components/search/SearchResultsErrorBoundary";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  parseSearchParams,
  buildRawParamsFromSearchParams,
  buildCanonicalFilterParamsFromSearchParams,
} from "@/lib/search-params";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
import { V1PathResetSetter } from "@/components/search/V1PathResetSetter";
import { SearchResultsLoadingWrapper } from "@/components/search/SearchResultsLoadingWrapper";
import { InlineFilterStrip } from "@/components/search/InlineFilterStrip";
import { features } from "@/lib/env";
import { withTimeout, DEFAULT_TIMEOUTS } from "@/lib/timeout-wrapper";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";
import { checkServerComponentRateLimit } from "@/lib/with-rate-limit";
import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import type { Metadata } from "next";

type SearchPageSearchParams = {
  q?: string;
  where?: string;
  what?: string;
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
  const { q, what, locationLabel, filterParams } = parseSearchParams(rawParams);
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

  const locationHeading = locationLabel || q;
  const title = locationHeading
    ? `Rooms for rent in ${locationHeading} | Roomshare`
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

  const baseDescription = `Browse ${locationHeading ? `${locationHeading} ` : ""}room listings on Roomshare${what ? " that match your vibe" : ""}.`;
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
      canonical: locationLabel
        ? `/search?where=${encodeURIComponent(locationLabel)}`
        : q
          ? `/search?q=${encodeURIComponent(q)}`
          : "/search",
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawParams = await searchParams;

  const {
    q,
    locationLabel,
    what,
    filterParams,
    requestedPage,
    sortOption,
    boundsRequired,
    browseMode,
  } = parseSearchParams(rawParams);

  // Early return for unbounded searches - check BEFORE any search attempt
  // This ensures friendly UX regardless of V2/V1 path or failures
  if (boundsRequired) {
    const searchLabel = locationLabel || q || what || "your search";
    return (
      <>
        {/* P2b Fix: Reset v2 context state on bounds-required path.
                    Without this, isV2Enabled stays true from a previous v2 search,
                    causing PersistentMapWrapper's race guard to loop forever. */}
        <V1PathResetSetter />
        <div className="px-4 sm:px-6 py-8 sm:py-12 max-w-[840px] mx-auto">
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
              <Search className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-on-surface mb-3">
              Please select a location
            </h1>
            <p className="text-on-surface-variant max-w-md mx-auto mb-6">
              To search for &ldquo;{searchLabel}&rdquo;, please select a
              location from the dropdown suggestions. This helps us find
              relevant listings in your area.
            </p>
            <Button asChild>
              <Link href="/">
                <Search className="w-4 h-4" />
                Try a new search
              </Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  // P0-2 FIX: Rate limit SSR search to prevent bot-driven DB connection pool exhaustion.
  // This is the only search path that previously lacked rate limiting:
  // - API routes have withRateLimitRedis
  // - Server actions have checkServerComponentRateLimit
  // - SSR page had nothing — bots could hammer /search with varying params
  // Uses dedicated "search-ssr" bucket (120/min) separate from "search" (60/min for server actions)
  // to prevent map panning (which generates SSR at 800ms intervals) from exhausting Load More budget.
  const headersList = await headers();
  const ssrRateLimit = await checkServerComponentRateLimit(
    headersList,
    "search-ssr",
    "/search"
  );
  if (!ssrRateLimit.allowed) {
    return (
      <>
        <V1PathResetSetter />
        <div className="px-4 sm:px-6 py-8 sm:py-12 max-w-[840px] mx-auto">
          <div className="text-center py-12">
            <h1 className="text-2xl font-display font-bold text-on-surface mb-3">
              Too many requests
            </h1>
            <p className="text-on-surface-variant max-w-md mx-auto mb-6">
              Please wait a moment before searching again.
            </p>
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
  let vibeAdvisory: string | undefined;

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

      // P0 FIX: Circuit breaker + timeout protection to prevent SSR hangs
      // Circuit breaker skips V2 entirely after 3 consecutive failures (saves 10s/request during outage)
      // V1 fallback (catch block below) IS the retry mechanism — no withRetry needed
      // P0-1 FIX: Throw on V2 error-returns so circuit breaker correctly tracks failures.
      // Previously, executeSearchV2 swallowed errors into { error: "..." } return values,
      // which resolved the promise successfully — the circuit breaker never saw failures.
      const v2Result = await circuitBreakers.searchV2.execute(async () => {
        const result = await withTimeout(
          executeSearchV2({
            rawParams: rawParamsForV2,
            limit: DEFAULT_PAGE_SIZE,
            includeMap: false,
          }),
          DEFAULT_TIMEOUTS.DATABASE,
          "SSR-executeSearchV2"
        );
        // Let unboundedSearch pass through — it's intentional, not a failure
        if (result.unboundedSearch) return result;
        // Throw on actual V2 failures so circuit breaker tracks them
        if (!result.response || result.error) {
          throw new Error(result.error || "V2 search returned no response");
        }
        return result;
      });

      // V2 returned valid data - use it
      if (v2Result.response && v2Result.paginatedResult) {
        // V2 succeeded - use its data
        usedV2 = true;
        paginatedResult = v2Result.paginatedResult;
        v2NextCursor = v2Result.response.list.nextCursor ?? null;
        if (v2Result.response.meta.warnings?.includes("VIBE_SOFT_FALLBACK")) {
          vibeAdvisory = "Showing best matches for your vibe in this area";
        }
      }
    } catch (err) {
      // V2 failed - will fall back to v1 below
      if (isCircuitOpenError(err)) {
        // Circuit open — skip V2 entirely, no timeout delay
        logger.sync.info("[search/page] V2 circuit open, using V1 fallback");
      } else {
        // Unexpected V2 failure — capture for monitoring
        Sentry.captureException(err, {
          tags: { component: "search-ssr", path: "v2-fallback" },
          extra: { hasV2Override: v2Override },
        });
        logger.sync.warn(
          "[search/page] V2 orchestration failed, falling back to v1",
          { error: sanitizeErrorMessage(err) }
        );
      }
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

  // Extract near-match expansion description for UI disclosure
  const nearMatchExpansion =
    "nearMatchExpansion" in paginatedResult
      ? paginatedResult.nearMatchExpansion
      : undefined;

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

  // P2-11 FIX: Build normalized key for SearchResultsClient's React key.
  // Raw searchParamsString is kept for API calls (backward compatible).
  // Normalized key prevents unnecessary remounts when URL has non-canonical values
  // (e.g., roomType=PRIVATE vs roomType=Private+Room from manual URL editing).
  // Uses buildCanonicalFilterParamsFromSearchParams (validated, sorted, aliased)
  // plus sort and quantized bounds (which the canonical builder excludes).
  const normalizedKey = buildCanonicalFilterParamsFromSearchParams(
    new URLSearchParams(searchParamsString)
  );
  if (sortOption !== "recommended") {
    normalizedKey.set("sort", sortOption);
  }
  if (filterParams.bounds) {
    // Quantize to 3 decimal places (~100m precision) to avoid micro-remounts
    // from sub-pixel map pans. Aligns with BOUNDS_EPSILON = 0.001 in constants.ts.
    normalizedKey.set("minLat", filterParams.bounds.minLat.toFixed(3));
    normalizedKey.set("maxLat", filterParams.bounds.maxLat.toFixed(3));
    normalizedKey.set("minLng", filterParams.bounds.minLng.toFixed(3));
    normalizedKey.set("maxLng", filterParams.bounds.maxLng.toFixed(3));
  }
  normalizedKey.sort();
  const normalizedKeyString = normalizedKey.toString();

  // Extract nextCursor: prefer V2 response cursor, fallback to paginatedResult for keyset path
  const initialNextCursor =
    v2NextCursor ??
    ("nextCursor" in paginatedResult
      ? (paginatedResult.nextCursor ?? null)
      : null);

  const displayLocation = locationLabel || q || "";

  const listContent = (
    <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
      <div className="px-4 sm:px-5 lg:px-8 pt-0">
        <InlineFilterStrip />

        <div className="flex flex-row items-center justify-between gap-4 py-2 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 min-w-0">
              <h1
                id="search-results-heading"
                tabIndex={-1}
                className="text-lg md:text-xl font-display font-medium tracking-tight text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:rounded-lg truncate"
              >
                {total === null ? "100+" : total}{" "}
                {total === 1 ? "place" : "places"}
                {displayLocation ? ` in ${displayLocation}` : ""}
              </h1>
              {listings.length > 0 && (
                <span className="text-xs bg-surface-container-high text-on-surface-variant px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                  Showing 1–{listings.length}
                </span>
              )}
            </div>
            {browseMode && (
              <p className="text-xs text-on-surface-variant mt-0.5">
                Showing top listings. Select a location for more results.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <SaveSearchButton />
            <SortSelect currentSort={sortOption} />
          </div>
        </div>

        <SearchResultsLoadingWrapper>
          <SearchResultsErrorBoundary>
            <SearchResultsClient
              key={normalizedKeyString}
              initialListings={listings}
              initialNextCursor={initialNextCursor}
              initialTotal={total}
              savedListingIds={[]}
              searchParamsString={searchParamsString}
              filterParams={filterParams}
              query={displayLocation}
              vibeQuery={what}
              browseMode={browseMode}
              hasConfirmedZeroResults={hasConfirmedZeroResults}
              filterSuggestions={[]}
              nearMatchExpansion={nearMatchExpansion}
              vibeAdvisory={vibeAdvisory}
              clientSideSearchEnabled={features.clientSideSearch}
            />
          </SearchResultsErrorBoundary>
        </SearchResultsLoadingWrapper>
      </div>
    </div>
  );

  return (
    <>
      {/* Keep the initial HTML list-first and let the persistent map fetch independently */}
      {/* TODO: Wire V2MapDataSetter here when V2 map feature ships.
          Currently V2MapDataSetter exists but has no render site — V2 map data path is dead code.
          V1PathResetSetter runs on every render, keeping isV2Enabled=false. */}
      <V1PathResetSetter />
      {listContent}
    </>
  );
}
