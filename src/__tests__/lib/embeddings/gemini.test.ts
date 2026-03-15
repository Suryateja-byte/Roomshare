/**
 * Test the embedding module's normalization and error handling.
 * Gemini API calls are mocked — no real API key needed.
 *
 * Mock structure matches @google/genai v1.x:
 * - embedContent() returns { embeddings: [{ values: number[] } } (singular)
 * - batchEmbedContents() returns { embeddings: [{ values: number[] }] } (plural)
 */

// Set env var BEFORE module load
process.env.GEMINI_API_KEY = "test-key";

const mockEmbedContent = jest.fn();
const mockBatchEmbedContents = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      embedContent: mockEmbedContent,
      batchEmbedContents: mockBatchEmbedContents,
    },
  })),
}));

import {
  generateEmbedding,
  generateQueryEmbedding,
} from "@/lib/embeddings/gemini";

describe("generateEmbedding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns L2-normalized vector", async () => {
    // Unnormalized vector [3, 4] should become [0.6, 0.8]
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [3, 4] }],
    });

    const result = await generateEmbedding("test text");
    const magnitude = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it("throws on empty embedding response", async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [] });
    await expect(generateEmbedding("test")).rejects.toThrow("No embedding");
  });

  it("truncates input longer than MAX_INPUT_LENGTH", async () => {
    const longText = "a".repeat(5000);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1] }],
    });

    await generateEmbedding(longText);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.contents.length).toBeLessThanOrEqual(2000);
  });
});

describe("generateQueryEmbedding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses RETRIEVAL_QUERY task type", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });

    await generateQueryEmbedding("search query");

    expect(mockEmbedContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ taskType: "RETRIEVAL_QUERY" }),
      })
    );
  });
});
