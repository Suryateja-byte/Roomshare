/**
 * Contract tests for CFM-703 — PRIVATE_FEEDBACK never bleeds into public endpoints.
 *
 * Teeth: lower-level mocks seed report-shaped payloads (both ABUSE_REPORT and
 * PRIVATE_FEEDBACK) beneath the real response-shaping code. If a future PR
 * starts selecting or forwarding report data into these public responses, the
 * seeded values bleed into the JSON and `expectNoReportLeak` fails.
 */

const REPORT_FIXTURES = [
  {
    id: "abuse-report-should-never-leak",
    kind: "ABUSE_REPORT",
    details: "ABUSE_REPORT_SHOULD_NOT_LEAK",
    body: "ABUSE_REPORT_BODY_SHOULD_NOT_LEAK",
  },
  {
    id: "private-feedback-should-never-leak",
    kind: "PRIVATE_FEEDBACK",
    details: "PRIVATE_FEEDBACK_SHOULD_NOT_LEAK",
    body: "PRIVATE_FEEDBACK_BODY_SHOULD_NOT_LEAK",
  },
] as const;

const PUBLIC_AVAILABILITY = {
  availabilitySource: "LEGACY_BOOKING",
  openSlots: 1,
  totalSlots: 1,
  effectiveAvailableSlots: 1,
  isAvailable: true,
  unavailableReason: null,
};

function expectNoReportLeak(payload: unknown) {
  const serialized = JSON.stringify(payload);

  expect(serialized).not.toContain('"reports"');
  expect(serialized).not.toContain('"kind":"ABUSE_REPORT"');
  expect(serialized).not.toContain('"kind":"PRIVATE_FEEDBACK"');
  expect(serialized).not.toContain('"body":');

  for (const report of REPORT_FIXTURES) {
    expect(serialized).not.toContain(report.id);
    expect(serialized).not.toContain(report.details);
    expect(serialized).not.toContain(report.body);
  }
}

function mockNextResponseModule() {
  jest.doMock("next/server", () => ({
    NextResponse: {
      json: (
        data: unknown,
        init?: { status?: number; headers?: Record<string, string> }
      ) => {
        const headersMap = new Map(Object.entries(init?.headers || {}));

        return {
          status: init?.status || 200,
          json: async () => data,
          headers: {
            get: (key: string) => headersMap.get(key) || null,
            entries: () => headersMap.entries(),
          },
        };
      },
    },
  }));
}

function createListingSqlRow() {
  return {
    id: "listing-1",
    title: "Public listing",
    description: "Visible listing data",
    price: 1200,
    images: ["https://example.com/listing.jpg"],
    availableSlots: 1,
    totalSlots: 1,
    amenities: ["Wifi"],
    houseRules: ["No smoking"],
    household_languages: ["en"],
    primary_home_language: "en",
    genderPreference: null,
    householdGender: null,
    leaseDuration: "6 months",
    roomType: "Private room",
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    availabilitySource: "LEGACY_BOOKING",
    openSlots: 1,
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: null,
    statusReason: null,
    needsMigrationReview: false,
    status: "ACTIVE",
    createdAt: new Date("2026-04-10T00:00:00.000Z"),
    viewCount: 4,
    avg_rating: 4.8,
    review_count: 12,
    city: "Chicago",
    state: "IL",
    lat: 41.8781,
    lng: -87.6298,
    reports: REPORT_FIXTURES,
    kind: REPORT_FIXTURES[1].kind,
    details: REPORT_FIXTURES[1].details,
    body: REPORT_FIXTURES[1].body,
  };
}

function createMapSqlRow() {
  return {
    id: "listing-1",
    title: "Map result",
    price: 1200,
    availableSlots: 1,
    totalSlots: 1,
    availabilitySource: "LEGACY_BOOKING",
    openSlots: 1,
    availableUntil: null,
    minStayMonths: 1,
    lastConfirmedAt: null,
    statusReason: null,
    needsMigrationReview: false,
    status: "ACTIVE",
    moveInDate: new Date("2026-05-01T00:00:00.000Z"),
    roomType: "Private room",
    images: ["https://example.com/map.jpg"],
    city: "Chicago",
    state: "IL",
    lng: -87.6298,
    lat: 41.8781,
    avgRating: 4.7,
    reviewCount: 9,
    reports: REPORT_FIXTURES,
    kind: REPORT_FIXTURES[0].kind,
    details: REPORT_FIXTURES[0].details,
    body: REPORT_FIXTURES[0].body,
  };
}

describe("private feedback no-public-bleed contract", () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("does not leak any report rows from GET /api/listings", async () => {
    mockNextResponseModule();
    jest.doMock("@/lib/query-timeout", () => ({
      queryWithTimeout: jest.fn(async (query: string) => {
        if (query.includes("COUNT(DISTINCT l.id)")) {
          return [{ total: BigInt(1) }];
        }

        return [createListingSqlRow()];
      }),
    }));
    jest.doMock("@/lib/search/search-doc-queries", () => ({
      getSearchDocLimitedCount: jest.fn(),
      isSearchDocEnabled: jest.fn().mockReturnValue(false),
      MAX_UNBOUNDED_RESULTS: 100,
    }));
    jest.doMock("@/lib/with-rate-limit-redis", () => ({
      withRateLimitRedis: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock("@/lib/search-params", () => ({
      buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
      hasActiveFilters: jest.fn().mockReturnValue(false),
      parseSearchParams: jest.fn().mockReturnValue({
        filterParams: { query: undefined },
        requestedPage: 1,
        boundsRequired: false,
      }),
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: { info: jest.fn(), sync: { error: jest.fn(), warn: jest.fn() } },
    }));
    jest.doMock("@/lib/api-error-handler", () => ({
      captureApiError: jest.fn(),
    }));
    jest.doMock("@/lib/errors/data-errors", () => ({
      isDataError: jest.fn().mockReturnValue(false),
    }));
    jest.doMock("@/lib/prisma", () => ({
      prisma: {},
    }));
    jest.doMock("@/auth", () => ({ auth: jest.fn() }));
    jest.doMock("@/lib/geocoding", () => ({ geocodeAddress: jest.fn() }));
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
          findMany: jest.fn().mockImplementation(
            async ({
              include,
            }: {
              include?: {
                author?: unknown;
                listing?: { include?: { reports?: boolean } };
                reports?: boolean;
              };
            }) => {
              const wantsReports =
                Boolean(include?.reports) ||
                Boolean(include?.listing?.include?.reports);

              return [
                {
                  id: "review-1",
                  rating: 5,
                  comment: "Public review",
                  createdAt: new Date("2026-04-10T00:00:00.000Z"),
                  author: { name: "Reviewer", image: null },
                  ...(wantsReports
                    ? {
                        listing: {
                          id: "listing-1",
                          reports: REPORT_FIXTURES,
                        },
                      }
                    : {}),
                },
              ];
            }
          ),
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
    jest.doMock("@/lib/search/search-v2-service", () => {
      const {
        transformToListItems,
        transformToMapResponse,
      } = jest.requireActual("@/lib/search/transform");

      const leakedListItems = transformToListItems([
        {
          id: "listing-1",
          title: "Search result",
          price: 1500,
          images: ["https://example.com/search.jpg"],
          location: { lat: 41.8781, lng: -87.6298 },
          publicAvailability: PUBLIC_AVAILABILITY,
          reports: REPORT_FIXTURES,
          kind: REPORT_FIXTURES[1].kind,
          details: REPORT_FIXTURES[1].details,
          body: REPORT_FIXTURES[1].body,
        },
      ]);

      const leakedMapResponse = transformToMapResponse([
        {
          id: "listing-1",
          title: "Search result",
          price: 1500,
          images: ["https://example.com/search.jpg"],
          location: { lat: 41.8781, lng: -87.6298 },
          publicAvailability: PUBLIC_AVAILABILITY,
          reports: REPORT_FIXTURES,
          kind: REPORT_FIXTURES[0].kind,
          details: REPORT_FIXTURES[0].details,
          body: REPORT_FIXTURES[0].body,
        },
      ]);

      return {
        executeSearchV2: jest.fn().mockResolvedValue({
          response: {
            meta: {
              mode: "pins",
              queryHash: "query-hash",
              generatedAt: new Date("2026-04-17T00:00:00.000Z").toISOString(),
            },
            list: {
              items: leakedListItems,
              nextCursor: null,
              total: leakedListItems.length,
            },
            map: leakedMapResponse,
          },
        }),
      };
    });
    jest.doMock("@/lib/search-params", () => ({
      buildRawParamsFromSearchParams: jest.fn().mockReturnValue({}),
    }));
    jest.doMock("@/lib/env", () => ({
      features: {
        searchV2: true,
      },
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
    jest.doMock("@/lib/timeout-wrapper", () => ({
      withTimeout: jest.fn((promise: Promise<unknown>) => promise),
      DEFAULT_TIMEOUTS: { DATABASE: 1000 },
    }));
    jest.doMock("@/lib/logger", () => ({
      logger: {
        sync: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
      },
      sanitizeErrorMessage: jest.fn().mockReturnValue("sanitized"),
    }));
    jest.doMock("@sentry/nextjs", () => ({
      captureException: jest.fn(),
    }));

    const { GET } = await import("@/app/api/search/v2/route");

    const response = await GET({
      nextUrl: { searchParams: new URLSearchParams() },
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(200);
    expectNoReportLeak(await response.json());
  });

  it("does not leak any report rows from GET /api/map-listings", async () => {
    mockNextResponseModule();
    jest.doMock("@/lib/data", () => {
      const {
        sanitizeMapListings,
      } = jest.requireActual("@/lib/maps/sanitize-map-listings");

      return {
        getMapListings: jest.fn().mockResolvedValue(
          sanitizeMapListings([createMapSqlRow()])
        ),
      };
    });
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
          minLat: 41.7,
          maxLat: 42,
          minLng: -87.8,
          maxLng: -87.5,
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
    url.searchParams.set("minLng", "-87.8");
    url.searchParams.set("maxLng", "-87.5");
    url.searchParams.set("minLat", "41.7");
    url.searchParams.set("maxLat", "42.0");

    const request = new Request(url.toString(), { method: "GET" }) as Request & {
      nextUrl: URL;
    };
    request.nextUrl = url;

    const response = await GET(request as never);

    expect(response.status).toBe(200);
    expectNoReportLeak(await response.json());
  });
});
