/**
 * Unit tests for syncListingEmbedding state machine.
 * Verifies PROCESSING guard, dedup, success/failure paths, and recoverStuckEmbeddings.
 * All external dependencies (prisma, generateEmbedding, composeListingText) are mocked.
 */

// Must mock before imports
const mockQueryRaw = jest.fn();
const mockExecuteRaw = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  },
}));

const mockGenerateEmbedding = jest.fn();
const mockGenerateMultimodalEmbedding = jest.fn();
jest.mock("@/lib/embeddings/gemini", () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
  generateMultimodalEmbedding: (...args: unknown[]) =>
    mockGenerateMultimodalEmbedding(...args),
  EMBEDDING_MODEL: "gemini-embedding-2.search-result.nosensitive-v1.d768",
}));

const mockComposeListingText = jest.fn();
jest.mock("@/lib/embeddings/compose", () => ({
  composeListingText: (...args: unknown[]) => mockComposeListingText(...args),
}));

const mockFetchAndProcessListingImages = jest.fn();
const mockComputeImageHash = jest.fn();
jest.mock("@/lib/embeddings/images", () => ({
  fetchAndProcessListingImages: (...args: unknown[]) =>
    mockFetchAndProcessListingImages(...args),
  computeImageHash: (...args: unknown[]) => mockComputeImageHash(...args),
}));

let mockImageEmbeddingsFlag = false;
jest.mock("@/lib/env", () => ({
  features: {
    get imageEmbeddings() {
      return mockImageEmbeddingsFlag;
    },
  },
}));

// Suppress Sentry dynamic import noise in tests
jest.mock("@sentry/nextjs", () => ({ addBreadcrumb: jest.fn() }), {
  virtual: true,
});

jest.mock("@/lib/logger", () => ({
  logger: {
    sync: {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  },
}));

import {
  syncListingEmbedding,
  recoverStuckEmbeddings,
} from "@/lib/embeddings/sync";

const LISTING_ID = "listing-abc";

/** Minimal valid search doc row */
const makeDoc = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: LISTING_ID,
  title: "Sunny Room",
  description: "Great place",
  price: 800,
  room_type: "PRIVATE",
  amenities: [],
  house_rules: [],
  lease_duration: null,
  gender_preference: null,
  household_gender: null,
  household_languages: [],
  primary_home_language: null,
  available_slots: 1,
  total_slots: 2,
  city: "Austin",
  state: "TX",
  address: null,
  move_in_date: null,
  booking_mode: "SHARED",
  images: [],
  embedding_text: null,
  embedding_status: "PENDING",
  embedding_image_hash: null,
  embedding_model: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryRaw.mockReset();
  mockExecuteRaw.mockReset();
  mockGenerateEmbedding.mockReset();
  mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  // Default: composeListingText returns a stable string
  mockComposeListingText.mockReset();
  mockComposeListingText.mockReturnValue("composed text");
  mockFetchAndProcessListingImages.mockReset();
  mockFetchAndProcessListingImages.mockResolvedValue([]);
  mockComputeImageHash.mockReset();
  mockComputeImageHash.mockReturnValue("hash-abc");
  mockGenerateMultimodalEmbedding.mockReset();
  mockGenerateMultimodalEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  mockImageEmbeddingsFlag = false;
});

describe("syncListingEmbedding", () => {
  it("returns early when listing not found in search docs", async () => {
    mockQueryRaw.mockResolvedValueOnce([]); // no rows

    await syncListingEmbedding(LISTING_ID);

    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  it("returns early when embedding text has not changed (dedup)", async () => {
    const existingText = "composed text";
    mockComposeListingText.mockReturnValue(existingText);
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        embedding_text: existingText,
        embedding_status: "COMPLETED",
        embedding_image_hash: null,
        embedding_model: "gemini-embedding-2.search-result.nosensitive-v1.d768",
      }),
    ]);

    await syncListingEmbedding(LISTING_ID);

    // No PROCESSING claim, no Gemini call
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("re-embeds when text and images are unchanged but embedding version changed", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        embedding_text: "composed text",
        embedding_status: "COMPLETED",
        embedding_image_hash: null,
        embedding_model: "gemini-embedding-2-preview",
      }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1);
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1);

    await syncListingEmbedding(LISTING_ID);

    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
  });

  it("re-embeds unchanged failed rows even when version is current", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        embedding_text: "composed text",
        embedding_status: "FAILED",
        embedding_image_hash: null,
        embedding_model: "gemini-embedding-2.search-result.nosensitive-v1.d768",
      }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1);
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1);

    await syncListingEmbedding(LISTING_ID);

    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("claims row atomically before calling Gemini (PROCESSING guard)", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    // Simulate atomic claim: row was NOT already PROCESSING → claimed = 1
    mockExecuteRaw.mockResolvedValueOnce(1); // atomic PROCESSING claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockExecuteRaw.mockResolvedValueOnce(1); // COMPLETED update

    await syncListingEmbedding(LISTING_ID);

    // First executeRaw call must be the atomic claim with AND embedding_status != 'PROCESSING'
    const firstCall = mockExecuteRaw.mock.calls[0];
    // The template literal produces a TemplateStringsArray; we check the raw SQL strings
    const sqlParts: string[] = Array.from(firstCall[0] as TemplateStringsArray);
    const fullSql = sqlParts.join("?");
    expect(fullSql).toContain("embedding_status != 'PROCESSING'");
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
  });

  it("returns early (no Gemini call) when claim returns 0 (already PROCESSING)", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ embedding_status: "PROCESSING" }),
    ]);
    // Atomic claim returns 0 → row is already being processed
    mockExecuteRaw.mockResolvedValueOnce(0);

    await syncListingEmbedding(LISTING_ID);

    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
    // Only one executeRaw call (the claim), no COMPLETED/FAILED update
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
  });

  it("sets status to COMPLETED with embedding on success", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    const embedding = [0.5, 0.5];
    mockGenerateEmbedding.mockResolvedValueOnce(embedding);
    mockExecuteRaw.mockResolvedValueOnce(1); // COMPLETED update

    await syncListingEmbedding(LISTING_ID);

    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    // Second call updates to COMPLETED — status is a tagged template param
    const allArgs = JSON.stringify(mockExecuteRaw.mock.calls[1]);
    expect(allArgs).toContain("COMPLETED");
    expect(allArgs).not.toContain("FAILED");
  });

  it("sets status to FAILED and increments attempts on Gemini error", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockRejectedValueOnce(
      new Error("API quota exceeded")
    );
    mockExecuteRaw.mockResolvedValueOnce(1); // FAILED update

    await syncListingEmbedding(LISTING_ID);

    // Should not throw — error is caught
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    const failCallSql = Array.from(
      mockExecuteRaw.mock.calls[1][0] as TemplateStringsArray
    ).join("?");
    expect(failCallSql).toContain("FAILED");
    expect(failCallSql).toContain("embedding_attempts");
  });

  it("does not throw when the FAILED cleanup UPDATE itself throws", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockRejectedValueOnce(new Error("network error"));
    // FAILED update also throws — should be swallowed by .catch(() => {})
    mockExecuteRaw.mockRejectedValueOnce(new Error("DB connection lost"));

    // Must resolve (not throw)
    await expect(syncListingEmbedding(LISTING_ID)).resolves.toBeUndefined();
  });
});

describe("image hash change detection", () => {
  it("re-embeds when text changed but images same", async () => {
    // Doc has old text but same image hash
    mockComputeImageHash.mockReturnValue("hash-abc");
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        images: ["https://example.com/img1.jpg"],
        embedding_text: "old text",
        embedding_image_hash: "hash-abc",
        embedding_status: "COMPLETED",
      }),
    ]);
    mockComposeListingText.mockReturnValue("new text");
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // Should have proceeded to embed (text differs)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
  });

  it("re-embeds when images changed but text same", async () => {
    // Same text, but image hash is different (new images uploaded)
    mockComputeImageHash.mockReturnValue("hash-new");
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        images: ["https://example.com/img2.jpg"],
        embedding_text: "composed text", // matches mockComposeListingText return
        embedding_image_hash: "hash-old",
        embedding_status: "COMPLETED",
      }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // hash-new !== hash-old → should re-embed
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
  });

  it("skips when both text AND image hash are unchanged", async () => {
    mockComputeImageHash.mockReturnValue("hash-abc");
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        images: ["https://example.com/img1.jpg"],
        embedding_text: "composed text", // matches mockComposeListingText return
        embedding_image_hash: "hash-abc", // matches mockComputeImageHash return
        embedding_status: "COMPLETED",
        embedding_model: "gemini-embedding-2.search-result.nosensitive-v1.d768",
      }),
    ]);

    await syncListingEmbedding(LISTING_ID);

    // Both match → dedup fires → no DB writes
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("re-embeds when images added (old hash null, new hash non-null)", async () => {
    mockComputeImageHash.mockReturnValue("hash-abc");
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        images: ["https://example.com/img1.jpg"],
        embedding_text: "composed text", // text unchanged
        embedding_image_hash: null, // no images before → hash was null
        embedding_status: "COMPLETED",
      }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // null !== "hash-abc" → should re-embed
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
  });

  it("re-embeds when images removed (old hash non-null, new images empty → null)", async () => {
    // images is [] → computeImageHash is NOT called → newImageHash is null
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({
        images: [],
        embedding_text: "composed text", // text unchanged
        embedding_image_hash: "hash-old", // had images before
        embedding_status: "COMPLETED",
      }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // "hash-old" !== null → should re-embed
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    // computeImageHash should NOT be called when images is empty
    expect(mockComputeImageHash).not.toHaveBeenCalled();
  });
});

describe("feature flag gating", () => {
  it("flag OFF → does NOT call fetchAndProcessListingImages, uses generateEmbedding (text-only)", async () => {
    mockImageEmbeddingsFlag = false;
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: ["https://example.com/img1.jpg"] }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    expect(mockFetchAndProcessListingImages).not.toHaveBeenCalled();
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockGenerateMultimodalEmbedding).not.toHaveBeenCalled();
  });

  it("flag ON + images=[] → does NOT call fetchAndProcessListingImages, uses generateEmbedding", async () => {
    mockImageEmbeddingsFlag = true;
    mockQueryRaw.mockResolvedValueOnce([makeDoc({ images: [] })]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // imageUrls.length === 0 → skip image fetch
    expect(mockFetchAndProcessListingImages).not.toHaveBeenCalled();
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockGenerateMultimodalEmbedding).not.toHaveBeenCalled();
  });

  it("flag ON + images present → calls fetchAndProcessListingImages", async () => {
    mockImageEmbeddingsFlag = true;
    const imageUrls = ["https://example.com/img1.jpg"];
    mockComputeImageHash.mockReturnValue("hash-new");
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockFetchAndProcessListingImages.mockResolvedValue([
      { type: "image", data: "base64data", mimeType: "image/jpeg" },
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateMultimodalEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    expect(mockFetchAndProcessListingImages).toHaveBeenCalledWith(imageUrls);
  });

  it("image fetch throws → catches error, falls back to text-only generateEmbedding", async () => {
    mockImageEmbeddingsFlag = true;
    const imageUrls = ["https://example.com/img1.jpg"];
    mockComputeImageHash.mockReturnValue("hash-new");
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockFetchAndProcessListingImages.mockRejectedValue(
      new Error("Network timeout")
    );
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    // Must not throw
    await expect(syncListingEmbedding(LISTING_ID)).resolves.toBeUndefined();

    // Falls back to text-only
    expect(mockGenerateEmbedding).toHaveBeenCalledTimes(1);
    expect(mockGenerateMultimodalEmbedding).not.toHaveBeenCalled();
  });
});

describe("multimodal vs text-only embedding", () => {
  it("calls generateMultimodalEmbedding when imageParts.length > 0", async () => {
    mockImageEmbeddingsFlag = true;
    const imageUrls = ["https://example.com/img1.jpg"];
    mockComputeImageHash.mockReturnValue("hash-new");
    const imageParts = [
      { type: "image", data: "base64data", mimeType: "image/jpeg" },
    ];
    mockFetchAndProcessListingImages.mockResolvedValue(imageParts);
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateMultimodalEmbedding.mockResolvedValueOnce([0.5, 0.6, 0.7]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    expect(mockGenerateMultimodalEmbedding).toHaveBeenCalledWith(
      "composed text",
      imageParts,
      "RETRIEVAL_DOCUMENT",
      { title: "Sunny Room" }
    );
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("calls generateEmbedding when imageParts.length === 0", async () => {
    mockImageEmbeddingsFlag = true;
    // images is [] → imageParts stays [] → text-only path
    mockQueryRaw.mockResolvedValueOnce([makeDoc({ images: [] })]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    expect(mockGenerateEmbedding).toHaveBeenCalledWith(
      "composed text",
      "RETRIEVAL_DOCUMENT",
      { title: "Sunny Room" }
    );
    expect(mockGenerateMultimodalEmbedding).not.toHaveBeenCalled();
  });

  it("stores EMBEDDING_MODEL in the UPDATE SQL", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // The second executeRaw call is the UPDATE with embedding_model
    const updateSqlParts = Array.from(
      mockExecuteRaw.mock.calls[1][0] as TemplateStringsArray
    ).join("?");
    expect(updateSqlParts).toContain("embedding_model");
    // The stored embedding profile version is passed as a param
    const updateParams = mockExecuteRaw.mock.calls[1].slice(1);
    expect(updateParams).toContain(
      "gemini-embedding-2.search-result.nosensitive-v1.d768"
    );
  });
});

describe("PARTIAL vs COMPLETED status", () => {
  it("COMPLETED when all images processed (imageParts.length === expectedImages)", async () => {
    mockImageEmbeddingsFlag = true;
    const imageUrls = [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
    ];
    mockComputeImageHash.mockReturnValue("hash-new");
    // Both images processed successfully
    const imageParts = [
      { type: "image", data: "b64a", mimeType: "image/jpeg" },
      { type: "image", data: "b64b", mimeType: "image/jpeg" },
    ];
    mockFetchAndProcessListingImages.mockResolvedValue(imageParts);
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateMultimodalEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // embedding_status is passed as a tagged template param — check full call args
    const allArgs = JSON.stringify(mockExecuteRaw.mock.calls[1]);
    expect(allArgs).toContain("COMPLETED");
    expect(allArgs).not.toContain("PARTIAL");
  });

  it("PARTIAL when some images failed (imageParts.length < expectedImages, but > 0)", async () => {
    mockImageEmbeddingsFlag = true;
    const imageUrls = [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
      "https://example.com/img3.jpg",
    ];
    mockComputeImageHash.mockReturnValue("hash-new");
    // Only 1 of 3 images processed (2 failed silently inside fetchAndProcessListingImages)
    const imageParts = [
      { type: "image", data: "b64a", mimeType: "image/jpeg" },
    ];
    mockFetchAndProcessListingImages.mockResolvedValue(imageParts);
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateMultimodalEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // embedding_status is passed as a tagged template param
    const allArgs = JSON.stringify(mockExecuteRaw.mock.calls[1]);
    expect(allArgs).toContain("PARTIAL");
  });

  it("COMPLETED when no images expected (flag OFF)", async () => {
    mockImageEmbeddingsFlag = false;
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // embedding_status is passed as a tagged template param
    const allArgs = JSON.stringify(mockExecuteRaw.mock.calls[1]);
    expect(allArgs).toContain("COMPLETED");
    expect(allArgs).not.toContain("PARTIAL");
  });

  it("embedding_image_count matches imageParts.length in UPDATE SQL", async () => {
    mockImageEmbeddingsFlag = true;
    const imageUrls = [
      "https://example.com/img1.jpg",
      "https://example.com/img2.jpg",
    ];
    mockComputeImageHash.mockReturnValue("hash-new");
    const imageParts = [
      { type: "image", data: "b64a", mimeType: "image/jpeg" },
      { type: "image", data: "b64b", mimeType: "image/jpeg" },
    ];
    mockFetchAndProcessListingImages.mockResolvedValue(imageParts);
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateMultimodalEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    const updateSql = Array.from(
      mockExecuteRaw.mock.calls[1][0] as TemplateStringsArray
    ).join("?");
    expect(updateSql).toContain("embedding_image_count");
    // The count (2) is passed as a tagged template param
    const allArgs = JSON.stringify(mockExecuteRaw.mock.calls[1]);
    expect(allArgs).toContain("2");
  });
});

describe("image failure does not increment embedding_attempts", () => {
  it("image fetch failure → text-only embed succeeds → does NOT go to FAILED path, attempts not incremented", async () => {
    // When imageUrls.length > 0 but all images fail, imageParts=[], expectedImages=1
    // → status is PARTIAL (some images were expected), NOT FAILED (Gemini embed succeeded)
    mockImageEmbeddingsFlag = true;
    const imageUrls = ["https://example.com/img1.jpg"];
    mockComputeImageHash.mockReturnValue("hash-new");
    mockFetchAndProcessListingImages.mockRejectedValue(
      new Error("CDN timeout")
    );
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // Should reach the success UPDATE (2 executeRaw calls total, not the FAILED cleanup)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    const updateSql = Array.from(
      mockExecuteRaw.mock.calls[1][0] as TemplateStringsArray
    ).join("?");
    // Success path resets attempts to 0 (not incremented like the FAILED path)
    expect(updateSql).toContain("embedding_attempts = 0");
    // embedding_status is PARTIAL (images were expected but none delivered)
    // but crucially NOT FAILED — the embedding itself succeeded via text-only fallback
    const allArgs = JSON.stringify(mockExecuteRaw.mock.calls[1]);
    expect(allArgs).toContain("PARTIAL");
    expect(allArgs).not.toContain("FAILED");
  });

  it("Gemini API failure → status FAILED, attempts incremented (existing behavior)", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockRejectedValueOnce(new Error("Gemini quota"));
    mockExecuteRaw.mockResolvedValueOnce(1); // FAILED update

    await syncListingEmbedding(LISTING_ID);

    const failSql = Array.from(
      mockExecuteRaw.mock.calls[1][0] as TemplateStringsArray
    ).join("?");
    expect(failSql).toContain("FAILED");
    expect(failSql).toContain("embedding_attempts");
    // The FAILED path uses COALESCE(embedding_attempts, 0) + 1
    expect(failSql).not.toContain("embedding_attempts = 0");
  });

  it("all images fail + text embed succeeds → status PARTIAL (not FAILED), embedding stored", async () => {
    // When all images fail (imageParts=[]) but text embedding succeeds, we get PARTIAL:
    // expectedImages=1 > 0, imageParts.length=0 < expectedImages → PARTIAL
    // The key invariant: embedding_attempts is NOT incremented (image failure ≠ embed failure)
    mockImageEmbeddingsFlag = true;
    const imageUrls = ["https://example.com/img1.jpg"];
    mockComputeImageHash.mockReturnValue("hash-new");
    // Entire image fetch fails → imageParts = []
    mockFetchAndProcessListingImages.mockRejectedValue(
      new Error("All images failed")
    );
    mockQueryRaw.mockResolvedValueOnce([
      makeDoc({ images: imageUrls, embedding_image_hash: "hash-old" }),
    ]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockResolvedValueOnce([0.3, 0.4, 0.5]);
    mockExecuteRaw.mockResolvedValueOnce(1); // update

    await syncListingEmbedding(LISTING_ID);

    // Must not throw, must not go to FAILED path (2 calls = claim + success update)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
    // embedding_status is a tagged template param — check full args
    const allArgs = JSON.stringify(mockExecuteRaw.mock.calls[1]);
    expect(allArgs).toContain("PARTIAL");
    expect(allArgs).not.toContain("FAILED");
  });
});

describe("recoverStuckEmbeddings", () => {
  it("resets PROCESSING rows older than staleMinutes to PENDING", async () => {
    mockExecuteRaw.mockResolvedValueOnce(3); // 3 rows updated

    const count = await recoverStuckEmbeddings(10);

    expect(count).toBe(3);
    const sqlParts = Array.from(
      mockExecuteRaw.mock.calls[0][0] as TemplateStringsArray
    ).join("?");
    expect(sqlParts).toContain("PENDING");
    expect(sqlParts).toContain("PROCESSING");
  });

  it("returns 0 when no stuck rows exist", async () => {
    mockExecuteRaw.mockResolvedValueOnce(0);

    const count = await recoverStuckEmbeddings();

    expect(count).toBe(0);
  });
});
