import {
  getListingsPaginated,
  PaginatedResult,
  PaginatedResultHybrid,
  ListingData,
} from "@/lib/data";
import { SearchResultsClient } from "@/components/search/SearchResultsClient";
import { SearchResultsErrorBoundary } from "@/components/search/SearchResultsErrorBoundary";
import SearchResultsMobileHeading from "@/components/search/SearchResultsMobileHeading";
import SearchResultsMobileSort from "@/components/search/SearchResultsMobileSort";
import SearchResultsToolbar from "@/components/search/SearchResultsToolbar";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  parseSearchParams,
  buildRawParamsFromSearchParams,
  detectLegacyUrlAliases,
  type RawSearchParams,
} from "@/lib/search-params";
import { executeSearchV2 } from "@/lib/search/search-v2-service";
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
import {
  createSearchResponseMeta,
  getSearchQueryHash,
  type SearchListState,
} from "@/lib/search/search-response";
import {
  buildSeoCanonicalSearchUrl,
  normalizeSearchQuery,
  serializeSearchQuery,
} from "@/lib/search/search-query";
import {
  buildScenarioSearchListState,
  resolveSearchScenario,
  SEARCH_SCENARIO_HEADER,
} from "@/lib/search/testing/search-scenarios";
import {
  recordLegacyUrlUsage,
  recordSearchRequestLatency,
  recordSearchV2Fallback,
  recordSearchZeroResults,
} from "@/lib/search/search-telemetry";

type SearchPageSearchParams = {
  q?: string;
  where?: string;
  what?: string;
  minPrice?: string;
  maxPrice?: string;
  amenities?: string | string[];
  moveInDate?: string;
  endDate?: string;
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

export const runtime = "nodejs";

interface SearchPageProps {
  searchParams: Promise<SearchPageSearchParams>;
}

function renderLocationRequiredState(searchLabel: string) {
  return (
    <div className="px-4 sm:px-6 py-8 sm:py-12 max-w-[840px] mx-auto">
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
          <Search className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-on-surface mb-3">
          Please select a location
        </h1>
        <p className="text-on-surface-variant max-w-md mx-auto mb-6">
          To search for &ldquo;{searchLabel}&rdquo;, please select a location
          from the dropdown suggestions. This helps us find relevant listings in
          your area.
        </p>
        <Button asChild>
          <Link href="/">
            <Search className="w-4 h-4" />
            Try a new search
          </Link>
        </Button>
      </div>
    </div>
  );
}

function renderRateLimitedState() {
  return (
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
  );
}

function getRenderableStateData(state: SearchListState) {
  if (state.kind === "ok" || state.kind === "degraded") {
    return {
      listings: state.data.items,
      total: state.data.total,
      initialNextCursor: state.data.nextCursor,
      nearMatchExpansion: state.data.nearMatchExpansion,
      vibeAdvisory: state.data.vibeAdvisory,
      hasConfirmedZeroResults: false,
    };
  }

  if (state.kind === "zero-results") {
    return {
      listings: [],
      total: 0,
      initialNextCursor: null,
      nearMatchExpansion: undefined,
      vibeAdvisory: undefined,
      hasConfirmedZeroResults: true,
    };
  }

  return null;
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
      // SEO canonical: only `/search` or `/search?q=...` — strips all
      // filter/sort/pagination params so every filter combination
      // collapses to the same indexable canonical page. See SEO-04 in
      // tests/e2e/seo/search-seo-meta.anon.spec.ts.
      canonical: buildSeoCanonicalSearchUrl(
        normalizeSearchQuery(rawParams as unknown as RawSearchParams)
      ),
    },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const requestStartTime = performance.now();
  const rawParams = await searchParams;
  for (const alias of detectLegacyUrlAliases(rawParams, {
    includeWhere: false,
  })) {
    recordLegacyUrlUsage({ alias, surface: "ssr" });
  }
  const normalizedQuery = normalizeSearchQuery(rawParams as RawSearchParams);

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
    recordSearchRequestLatency({
      route: "search-page-ssr",
      durationMs: performance.now() - requestStartTime,
      stateKind: "location-required",
      queryHash: getSearchQueryHash(normalizedQuery),
    });
    const searchLabel = locationLabel || q || what || "your search";
    return renderLocationRequiredState(searchLabel);
  }

  const headersList = await headers();
  const testScenario = resolveSearchScenario({
    headerValue: headersList.get(SEARCH_SCENARIO_HEADER),
  });

  if (testScenario) {
    const scenarioState = await buildScenarioSearchListState(testScenario, {
      query: normalizedQuery,
    });
    const scenarioResultCount =
      scenarioState.kind === "ok" || scenarioState.kind === "degraded"
        ? scenarioState.data.total
        : scenarioState.kind === "zero-results"
          ? 0
          : null;

    if (scenarioState.kind === "zero-results") {
      recordSearchZeroResults({
        route: "search-page-ssr",
        queryHash: scenarioState.meta.queryHash,
        backendSource: scenarioState.meta.backendSource,
      });
    }

    recordSearchRequestLatency({
      route: "search-page-ssr",
      durationMs: performance.now() - requestStartTime,
      backendSource: scenarioState.meta.backendSource,
      stateKind: scenarioState.kind,
      queryHash: scenarioState.meta.queryHash,
      resultCount: scenarioResultCount,
    });

    if (scenarioState.kind === "location-required") {
      return renderLocationRequiredState(locationLabel || q || what || "your search");
    }

    if (scenarioState.kind === "rate-limited") {
      return renderRateLimitedState();
    }

    const renderableScenarioData = getRenderableStateData(scenarioState);
    if (!renderableScenarioData) {
      throw new Error(`Unhandled scenario state: ${scenarioState.kind}`);
    }

    // CFM-604: canonical-on-write guarantee — SSR search URLs serialize via the canonical query builder.
    const searchParamsString = serializeSearchQuery(normalizedQuery, {
      includePagination: false,
    }).toString();
    const normalizedKeyString = searchParamsString;
    const displayLocation = locationLabel || q || "";

    return (
      <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
        <div className="px-4 sm:px-5 lg:px-8 pt-0">
          <InlineFilterStrip
            desktopSummary={{
              total: renderableScenarioData.total,
              visibleCount: renderableScenarioData.listings.length,
              locationLabel: displayLocation,
              browseMode,
            }}
            toolbarSlot={
              <SearchResultsToolbar
                currentSort={sortOption}
                hasResults={renderableScenarioData.total !== 0}
              />
            }
          />

          <SearchResultsMobileHeading
            total={renderableScenarioData.total}
            locationLabel={displayLocation}
          />
          <SearchResultsMobileSort currentSort={sortOption} />

          <SearchResultsLoadingWrapper>
            <SearchResultsErrorBoundary>
              <SearchResultsClient
                key={normalizedKeyString}
                initialListings={renderableScenarioData.listings}
                initialNextCursor={renderableScenarioData.initialNextCursor}
                initialTotal={renderableScenarioData.total}
                savedListingIds={[]}
                searchParamsString={searchParamsString}
                filterParams={filterParams}
                query={displayLocation}
                vibeQuery={what}
                browseMode={browseMode}
                hasConfirmedZeroResults={
                  renderableScenarioData.hasConfirmedZeroResults
                }
                filterSuggestions={[]}
                nearMatchExpansion={renderableScenarioData.nearMatchExpansion}
                vibeAdvisory={renderableScenarioData.vibeAdvisory}
                initialResponseMeta={scenarioState.meta}
                initialStateKind={scenarioState.kind}
                clientSideSearchEnabled={features.clientSideSearch}
              />
            </SearchResultsErrorBoundary>
          </SearchResultsLoadingWrapper>
        </div>
      </div>
    );
  }

  // P0-2 FIX: Rate limit SSR search to prevent bot-driven DB connection pool exhaustion.
  // This is the only search path that previously lacked rate limiting:
  // - API routes have withRateLimitRedis
  // - Server actions have checkServerComponentRateLimit
  // - SSR page had nothing — bots could hammer /search with varying params
  // Uses dedicated "search-ssr" bucket (120/min) separate from "search" (60/min for server actions)
  // to prevent map panning (which generates SSR at 800ms intervals) from exhausting Load More budget.
  const ssrRateLimit = await checkServerComponentRateLimit(
    headersList,
    "search-ssr",
    "/search"
  );
  if (!ssrRateLimit.allowed) {
    recordSearchRequestLatency({
      route: "search-page-ssr",
      durationMs: performance.now() - requestStartTime,
      stateKind: "rate-limited",
      queryHash: getSearchQueryHash(normalizedQuery),
    });
    return renderRateLimitedState();
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
    if (useV2Search) {
      recordSearchV2Fallback({
        route: "search-page-ssr",
        queryHash: getSearchQueryHash(normalizedQuery),
        reason: "v2_failed_or_unavailable",
      });
    }

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
  // CFM-604: canonical-on-write guarantee — SSR search URLs serialize via the canonical query builder.
  const searchParamsString = serializeSearchQuery(normalizedQuery, {
    includePagination: false,
  }).toString();
  const normalizedKeyString = searchParamsString;

  // Extract nextCursor: prefer V2 response cursor, fallback to paginatedResult for keyset path
  const initialNextCursor =
    v2NextCursor ??
    ("nextCursor" in paginatedResult
      ? (paginatedResult.nextCursor ?? null)
      : null);

  const displayLocation = locationLabel || q || "";
  const responseMeta = createSearchResponseMeta(
    normalizedQuery,
    usedV2 ? "v2" : "v1-fallback"
  );
  if (hasConfirmedZeroResults) {
    recordSearchZeroResults({
      route: "search-page-ssr",
      queryHash: responseMeta.queryHash,
      backendSource: responseMeta.backendSource,
    });
  }
  const initialStateKind: SearchListState["kind"] = hasConfirmedZeroResults
    ? "zero-results"
    : usedV2 || !useV2Search
      ? "ok"
      : "degraded";
  recordSearchRequestLatency({
    route: "search-page-ssr",
    durationMs: performance.now() - requestStartTime,
    backendSource: responseMeta.backendSource,
    stateKind: initialStateKind,
    queryHash: responseMeta.queryHash,
    resultCount: total,
  });

  const listContent = (
    <div className="max-w-[840px] mx-auto pb-24 md:pb-6">
      <div className="px-4 sm:px-5 lg:px-8 pt-0">
        <InlineFilterStrip
          desktopSummary={{
            total,
            visibleCount: listings.length,
            locationLabel: displayLocation,
            browseMode,
          }}
          toolbarSlot={
            <SearchResultsToolbar
              currentSort={sortOption}
              hasResults={total !== 0}
            />
          }
        />

        <SearchResultsMobileHeading
          total={total}
          locationLabel={displayLocation}
        />
        <SearchResultsMobileSort currentSort={sortOption} />

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
              initialResponseMeta={responseMeta}
              initialStateKind={initialStateKind}
              clientSideSearchEnabled={features.clientSideSearch}
            />
          </SearchResultsErrorBoundary>
        </SearchResultsLoadingWrapper>
      </div>
    </div>
  );

  return listContent;
}
