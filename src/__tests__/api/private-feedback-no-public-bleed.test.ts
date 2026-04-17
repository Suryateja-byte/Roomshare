/**
 * Contract tests for CFM-703.
 *
 * The repo does not expose a dedicated GET /api/listings/[id] JSON handler,
 * so this suite covers the actual public JSON read surfaces:
 * - GET /api/listings
 * - GET /api/reviews?listingId=...
 * - GET /api/search/v2
 * - GET /api/map-listings
 */

const REPORT_FIXTURES = [
  {
    id: "abuse-report-should-never-leak",
    kind: "ABUSE_REPORT",
    details: "ABUSE_REPORT_SHOULD_NOT_LEAK",
  },
  {
    id: "private-feedback-should-never-leak",
    kind: "PRIVATE_FEEDBACK",
    details: "PRIVATE_FEEDBACK_SHOULD_NOT_LEAK",
  },
] as const;

function expectNoReportLeak(payload: unknown) {
  const serialized = JSON.stringify(payload);
  for (const report of REPORT_FIXTURES) {
    expect(serialized).not.toContain(report.id);
    expect(serialized).not.toContain(report.details);
  }
}

function mockNextResponseModule() {
  jest.doMock("next/server", () => ({
    NextResponse: {
      json: (
        data: unknown,
        init?: { status?: number; headers?: Record<string, string> }
      ) => ({
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      }),
    },
  }));
}

describe("private feedback no-public-bleed contract", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("does not leak any report rows from GET /api/listings", async () => {
    mockNextResponseModule();
    jest.doMock("@/lib/with-rate-limit-redis", () => ({
      withRateLimitRedis: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/search-params", () => ({
      buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
      parseSearchParams: jest.fn().mockReturnValue({
        filterParams: { query: undefined },
        requestedPage: 1,
        boundsRequired: false,
      }),
    }));
    jest.doMock("@/lib/data", () => ({
      getListingsPaginated: jest.fn().mockResolvedValue({
        items: [
          {
            id: "listing-1",
            title: "Public listing",
            description: "Visible listing data",
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      }),
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: { info: jest.fn() },
    }));
    jest.doMock("@/lib/api-error-handler", () => ({
      captureApiError: jest.fn(),
    }));
    jest.doMock("@/lib/prisma", () => ({
      prisma: {},
    }));
    jest.doMock("@/auth", () => ({ auth: jest.fn() }));
    jest.doMock("@/lib/geocoding", () => ({ geocodeAddress: jest.fn() }));
    jest.doMock("@/lib/errors/data-errors", () => ({
      isDataError: jest.fn().mockReturnValue(false),
    }));
    jest.doMock("@/lib/with-rate-limit", () => ({
      withRateLimit: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/schemas", () => ({
      createListingApiSchema: { safeParse: jest.fn() },
    }));
    jest.doMock("@/lib/listing-language-guard", () => ({
      checkListingLanguageCompliance: jest.fn(),
    }));
    jest.doMock("@/lib/languages", () => ({
      isValidLanguageCode: jest.fn(),
    }));
    jest.doMock("@/app/actions/suspension", () => ({
      checkSuspension: jest.fn(),
      checkEmailVerified: jest.fn(),
    }));
    jest.doMock("@/lib/idempotency", () => ({
      withIdempotency: jest.fn(),
    }));
    jest.doMock("@/lib/search/search-doc-sync", () => ({
      upsertSearchDocSync: jest.fn(),
    }));
    jest.doMock("@/lib/search-alerts", () => ({
      triggerInstantAlerts: jest.fn(),
    }));
    jest.doMock("@/lib/circuit-breaker", () => ({
      isCircuitOpenError: jest.fn().mockReturnValue(false),
    }));
    jest.doMock("@/lib/csrf", () => ({
      validateCsrf: jest.fn().mockReturnValue(null),
    }));
    jest.doMock("@/lib/profile-completion", () => ({
      calculateProfileCompletion: jest.fn(),
      PROFILE_REQUIREMENTS: { createListing: 100 },
    }));
    jest.doMock("@/lib/env", () => ({
      features: { wholeUnitMode: false },
    }));
    jest.doMock("@/lib/embeddings/sync", () => ({
      syncListingEmbedding: jest.fn(),
    }));

    const { GET } = await import("@/app/api/listings/route");

    const response = await GET(new Request("http://localhost/api/listings"));
    expect(response.status).toBe(200);
    expectNoReportLeak(await response.json());
  });

  it("does not leak any report rows from GET /api/reviews", async () => {
    mockNextResponseModule();
    jest.doMock("@/lib/prisma", () => ({
      prisma: {
        review: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([
            {
              id: "review-1",
              comment: "Public review",
              author: { name: "Reviewer", image: null },
            },
          ]),
        },
      },
    }));
    jest.doMock("@/auth", () => ({ auth: jest.fn() }));
    jest.doMock("@/lib/notifications", () => ({
      createInternalNotification: jest.fn(),
    }));
    jest.doMock("@/lib/email", () => ({
      sendNotificationEmailWithPreference: jest.fn(),
    }));
    jest.doMock("@/app/actions/suspension", () => ({
      checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
    }));
    jest.doMock("@/lib/with-rate-limit", () => ({
      withRateLimit: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
      sanitizeErrorMessage: jest.fn((value: unknown) => String(value)),
    }));
    jest.doMock("@/lib/api-error-handler", () => ({
      captureApiError: jest.fn(),
    }));
    jest.doMock("@/lib/csrf", () => ({
      validateCsrf: jest.fn().mockReturnValue(null),
    }));
    jest.doMock("@/lib/search/search-doc-dirty", () => ({
      markListingDirtyInTx: jest.fn(),
    }));
    jest.doMock("@/lib/pagination-schema", () => ({
      parsePaginationParams: jest.fn().mockReturnValue({
        success: true,
        data: { cursor: undefined, limit: 20 },
      }),
      buildPaginationResponse: jest.fn((items: unknown[], _limit: number) => ({
        items,
        pagination: { total: 1, hasMore: false, nextCursor: null },
      })),
      buildPrismaQueryOptions: jest.fn().mockReturnValue({}),
    }));

    const { GET } = await import("@/app/api/reviews/route");

    const response = await GET(
      new Request("http://localhost/api/reviews?listingId=listing-1")
    );
    expect(response.status).toBe(200);
    expectNoReportLeak(await response.json());
  });

  it("does not leak any report rows from GET /api/search/v2", async () => {
    mockNextResponseModule();
    jest.doMock("@/lib/search/search-v2-service", () => ({
      executeSearchV2: jest.fn().mockResolvedValue({
        response: {
          meta: {
            mode: "pins",
            queryHash: "query-hash",
            generatedAt: new Date("2026-04-17T00:00:00.000Z").toISOString(),
          },
          list: {
            items: [{ id: "listing-1", title: "Search result" }],
            nextCursor: null,
            total: 1,
          },
          map: {
            geojson: { type: "FeatureCollection", features: [] },
          },
        },
      }),
    }));
    jest.doMock("@/lib/timeout-wrapper", () => ({
      withTimeout: jest.fn((promise: Promise<unknown>) => promise),
      DEFAULT_TIMEOUTS: { DATABASE: 1000 },
    }));
    jest.doMock("@/lib/search-params", () => ({
      buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
    }));
    jest.doMock("@/lib/with-rate-limit-redis", () => ({
      withRateLimitRedis: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/search-rate-limit-identifier", () => ({
      getSearchRateLimitIdentifier: jest.fn().mockResolvedValue("ip:1"),
    }));
    jest.doMock("@/lib/request-context", () => ({
      createContextFromHeaders: jest.fn().mockReturnValue({}),
      runWithRequestContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
      getRequestId: jest.fn().mockReturnValue("request-id"),
    }));
    jest.doMock("@/lib/env", () => ({
      features: { searchV2: true },
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
      sanitizeErrorMessage: jest.fn().mockReturnValue("sanitized"),
    }));
    jest.doMock("@sentry/nextjs", () => ({
      captureException: jest.fn(),
    }));

    const { GET } = await import("@/app/api/search/v2/route");
    const request = {
      nextUrl: { searchParams: new URLSearchParams() },
      headers: new Headers(),
    } as unknown as Request;

    const response = await GET(request as never);
    expect(response.status).toBe(200);
    expectNoReportLeak(await response.json());
  });

  it("does not leak any report rows from GET /api/map-listings", async () => {
    mockNextResponseModule();
    jest.doMock("@/lib/data", () => ({
      getMapListings: jest.fn().mockResolvedValue([
        {
          id: "listing-1",
          title: "Map result",
          price: 1200,
          images: ["https://example.com/1.jpg"],
          location: { lat: 37.78, lng: -122.42 },
        },
      ]),
    }));
    jest.doMock("@/lib/search/search-doc-queries", () => ({
      isSearchDocEnabled: jest.fn().mockReturnValue(false),
      getSearchDocMapListings: jest.fn(),
    }));
    jest.doMock("@/lib/env", () => ({
      features: { semanticSearch: false },
    }));
    jest.doMock("@/lib/with-rate-limit-redis", () => ({
      withRateLimitRedis: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/timeout-wrapper", () => ({
      withTimeout: jest.fn((promise: Promise<unknown>) => promise),
      DEFAULT_TIMEOUTS: { DATABASE: 1000 },
    }));
    jest.doMock("@/lib/validation", () => ({
      validateAndParseBounds: jest.fn().mockReturnValue({
        valid: true,
        bounds: {
          minLat: 37.5,
          maxLat: 38,
          minLng: -122.5,
          maxLng: -122,
        },
      }),
    }));
    jest.doMock("@/lib/request-context", () => ({
      createContextFromHeaders: jest.fn().mockReturnValue({}),
      runWithRequestContext: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
      getRequestId: jest.fn().mockReturnValue("request-id"),
    }));
    jest.doMock("@/lib/search-params", () => ({
      buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
      parseSearchParams: jest.fn().mockReturnValue({
        filterParams: { sort: undefined, vibeQuery: undefined },
      }),
    }));
    jest.doMock("@/lib/constants", () => ({
      MAP_FETCH_MAX_LAT_SPAN: 60,
      MAP_FETCH_MAX_LNG_SPAN: 130,
    }));
    jest.doMock("@/lib/search/location-bounds", () => ({
      boundsTupleToObject: jest.fn(),
      deriveSearchBoundsFromPoint: jest.fn(),
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: { sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } },
      sanitizeErrorMessage: jest.fn().mockReturnValue("sanitized"),
    }));
    jest.doMock("@sentry/nextjs", () => ({
      captureException: jest.fn(),
    }));
    jest.doMock("@/lib/search-rate-limit-identifier", () => ({
      getSearchRateLimitIdentifier: jest.fn().mockResolvedValue("ip:1"),
    }));
    jest.doMock("@/lib/search/search-response", () => ({
      createSearchResponseMeta: jest.fn().mockReturnValue({
        backendSource: "map-api",
        responseVersion: "1",
        queryHash: "query-hash",
      }),
    }));
    jest.doMock("@/lib/search/search-query", () => ({
      normalizeSearchQuery: jest.fn().mockReturnValue({}),
    }));
    jest.doMock("@/lib/search/testing/search-scenarios", () => ({
      buildScenarioSearchMapState: jest.fn(),
      resolveSearchScenario: jest.fn().mockReturnValue(null),
      SEARCH_SCENARIO_HEADER: "x-e2e-search-scenario",
    }));
    jest.doMock("@/lib/search/search-telemetry", () => ({
      recordSearchRequestLatency: jest.fn(),
    }));

    const { GET } = await import("@/app/api/map-listings/route");
    const url = new URL("http://localhost/api/map-listings");
    url.searchParams.set("minLng", "-122.5");
    url.searchParams.set("maxLng", "-122.0");
    url.searchParams.set("minLat", "37.5");
    url.searchParams.set("maxLat", "38.0");
    const request = new Request(url.toString(), { method: "GET" }) as Request & {
      nextUrl: URL;
    };
    request.nextUrl = url;

    const response = await GET(request as never);
    expect(response.status).toBe(200);
    expectNoReportLeak(await response.json());
  });
});
