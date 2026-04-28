const mockExecuteRawUnsafe = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockGetCachedQueryEmbedding = jest.fn();
const mockGetReadEmbeddingVersion = jest.fn();

jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn: () => unknown) => fn),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn((fn) =>
      fn({
        $executeRawUnsafe: mockExecuteRawUnsafe,
        $queryRawUnsafe: mockQueryRawUnsafe,
      })
    ),
  },
}));

jest.mock("@/lib/env", () => ({
  features: {
    semanticSearch: true,
    semanticWeight: 0.6,
  },
}));

jest.mock("@/lib/embeddings/query-cache", () => ({
  getCachedQueryEmbedding: (...args: unknown[]) =>
    mockGetCachedQueryEmbedding(...args),
}));

jest.mock("@/lib/embeddings/version", () => ({
  getReadEmbeddingVersion: (...args: unknown[]) =>
    mockGetReadEmbeddingVersion(...args),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
    },
  },
}));

import { semanticSearchQuery } from "@/lib/search/search-doc-queries";

function semanticRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    title: "Room",
    description: "Desc",
    price: 1200,
    images: [],
    room_type: "PRIVATE",
    lease_duration: null,
    available_slots: 1,
    total_slots: 2,
    amenities: [],
    house_rules: [],
    household_languages: [],
    primary_home_language: null,
    gender_preference: null,
    household_gender: null,
    booking_mode: "SHARED",
    move_in_date: null,
    address: null,
    city: "Austin",
    state: "TX",
    zip: null,
    lat: 30.2,
    lng: -97.7,
    owner_id: "owner-1",
    avg_rating: 5,
    review_count: 1,
    view_count: 10,
    listing_created_at: new Date("2026-04-01T00:00:00.000Z"),
    recommended_score: 0.9,
    semantic_similarity: 0.8,
    keyword_rank: 0,
    combined_score: 0.8,
    ...overrides,
  };
}

describe("semanticSearchQuery version isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteRawUnsafe.mockResolvedValue(1);
    mockQueryRawUnsafe
      .mockResolvedValueOnce([semanticRow()])
      .mockResolvedValueOnce([{ id: "listing-1" }]);
    mockGetCachedQueryEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
    mockGetReadEmbeddingVersion.mockReturnValue(
      "gemini-embedding-2.search-result.nosensitive-v1.d768"
    );
  });

  it("passes the read embedding version into SQL before ranking params", async () => {
    await semanticSearchQuery(
      {
        vibeQuery: "bright airy room",
        bounds: {
          minLat: 30,
          minLng: -98,
          maxLat: 31,
          maxLng: -97,
        },
      },
      12,
      0
    );

    const [sql, vectorSql, queryText, embeddingVersion] =
      mockQueryRawUnsafe.mock.calls[0];

    expect(sql).toContain("search_listings_semantic");
    expect(sql).toContain("$3");
    expect(vectorSql).toBe("[0.1,0.2,0.3]");
    expect(queryText).toBe("bright airy room");
    expect(embeddingVersion).toBe(
      "gemini-embedding-2.search-result.nosensitive-v1.d768"
    );
  });

  it("namespaces query embeddings by the same read embedding version", async () => {
    await semanticSearchQuery({ vibeQuery: "bright airy room" }, 12, 0);

    expect(mockGetCachedQueryEmbedding).toHaveBeenCalledWith(
      "bright airy room",
      "gemini-embedding-2.search-result.nosensitive-v1.d768"
    );
  });
});
