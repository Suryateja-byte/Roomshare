/**
 * Tests for the in-memory query embedding cache.
 * Mocks generateQueryEmbedding to avoid Gemini API calls.
 *
 * Uses __mocks__ pattern: jest.mock factory returns a function that
 * delegates to a mutable ref, avoiding TDZ issues with const hoisting.
 */

process.env.GEMINI_API_KEY = "test-key";

// Mutable container that the mock factory closes over (avoids TDZ)
const mocks = {
  generateQueryEmbedding: jest.fn(),
};

jest.mock("@/lib/embeddings/gemini", () => ({
  generateQueryEmbedding: (...args: unknown[]) => mocks.generateQueryEmbedding(...args),
  generateEmbedding: jest.fn(),
  generateBatchEmbeddings: jest.fn(),
}));

import {
  getCachedQueryEmbedding,
  queryCacheStats,
  clearQueryCache,
} from "@/lib/embeddings/query-cache";

const FAKE_EMBEDDING = Array.from({ length: 768 }, (_, i) => i * 0.001);

describe("Query Embedding Cache", () => {
  beforeEach(() => {
    clearQueryCache();
    mocks.generateQueryEmbedding.mockReset();
    mocks.generateQueryEmbedding.mockResolvedValue(FAKE_EMBEDDING);
  });

  it("calls generateQueryEmbedding on cache miss", async () => {
    const result = await getCachedQueryEmbedding("sunny room downtown");
    expect(mocks.generateQueryEmbedding).toHaveBeenCalledTimes(1);
    expect(mocks.generateQueryEmbedding).toHaveBeenCalledWith("sunny room downtown");
    expect(result).toBe(FAKE_EMBEDDING);
  });

  it("returns cached result on second call (cache hit)", async () => {
    await getCachedQueryEmbedding("sunny room downtown");
    const result = await getCachedQueryEmbedding("sunny room downtown");
    expect(mocks.generateQueryEmbedding).toHaveBeenCalledTimes(1);
    expect(result).toBe(FAKE_EMBEDDING);
  });

  it("normalizes query case for cache key", async () => {
    await getCachedQueryEmbedding("Sunny Room Downtown");
    await getCachedQueryEmbedding("sunny room downtown");
    await getCachedQueryEmbedding("SUNNY ROOM DOWNTOWN");
    expect(mocks.generateQueryEmbedding).toHaveBeenCalledTimes(1);
  });

  it("trims whitespace for cache key", async () => {
    await getCachedQueryEmbedding("  sunny room  ");
    await getCachedQueryEmbedding("sunny room");
    expect(mocks.generateQueryEmbedding).toHaveBeenCalledTimes(1);
  });

  it("treats different queries as separate cache entries", async () => {
    await getCachedQueryEmbedding("sunny room");
    await getCachedQueryEmbedding("cozy apartment");
    expect(mocks.generateQueryEmbedding).toHaveBeenCalledTimes(2);
  });

  it("reports correct hit/miss stats", async () => {
    await getCachedQueryEmbedding("query1");
    await getCachedQueryEmbedding("query1"); // hit
    await getCachedQueryEmbedding("query2"); // miss
    await getCachedQueryEmbedding("query2"); // hit

    const stats = queryCacheStats();
    expect(stats.size).toBe(2);
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
  });

  it("evicts oldest entry when exceeding max size", async () => {
    // Fill cache with 100 entries
    for (let i = 0; i < 100; i++) {
      mocks.generateQueryEmbedding.mockResolvedValueOnce([i]);
      await getCachedQueryEmbedding(`query-${i}`);
    }
    expect(queryCacheStats().size).toBe(100);

    // Add 101st entry — should evict query-0
    mocks.generateQueryEmbedding.mockResolvedValueOnce([100]);
    await getCachedQueryEmbedding("query-100");
    expect(queryCacheStats().size).toBe(100);

    // query-0 should be evicted — generates new embedding
    mocks.generateQueryEmbedding.mockResolvedValueOnce([999]);
    await getCachedQueryEmbedding("query-0");
    // Should have called generate for: 100 initial + 101st + re-fetch of query-0
    expect(mocks.generateQueryEmbedding).toHaveBeenCalledTimes(102);
  });

  it("clearQueryCache resets everything", async () => {
    await getCachedQueryEmbedding("test");
    clearQueryCache();
    const stats = queryCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});
