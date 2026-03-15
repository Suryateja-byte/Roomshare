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
jest.mock("@/lib/embeddings/gemini", () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

const mockComposeListingText = jest.fn();
jest.mock("@/lib/embeddings/compose", () => ({
  composeListingText: (...args: unknown[]) => mockComposeListingText(...args),
}));

// Suppress Sentry dynamic import noise in tests
jest.mock("@sentry/nextjs", () => ({ addBreadcrumb: jest.fn() }), {
  virtual: true,
});

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
  embedding_text: null,
  embedding_status: "PENDING",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: composeListingText returns a stable string
  mockComposeListingText.mockReturnValue("composed text");
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
      makeDoc({ embedding_text: existingText, embedding_status: "COMPLETED" }),
    ]);

    await syncListingEmbedding(LISTING_ID);

    // No PROCESSING claim, no Gemini call
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
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
    // Second call updates to COMPLETED
    const secondCallSql = Array.from(
      mockExecuteRaw.mock.calls[1][0] as TemplateStringsArray
    ).join("?");
    expect(secondCallSql).toContain("COMPLETED");
    expect(secondCallSql).not.toContain("FAILED");
  });

  it("sets status to FAILED and increments attempts on Gemini error", async () => {
    mockQueryRaw.mockResolvedValueOnce([makeDoc()]);
    mockExecuteRaw.mockResolvedValueOnce(1); // claim
    mockGenerateEmbedding.mockRejectedValueOnce(new Error("API quota exceeded"));
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
