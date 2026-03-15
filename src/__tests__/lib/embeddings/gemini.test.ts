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

jest.mock("@sentry/nextjs", () => ({ addBreadcrumb: jest.fn() }), { virtual: true });

import {
  generateEmbedding,
  generateQueryEmbedding,
  generateMultimodalEmbedding,
  EMBEDDING_MODEL,
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
    expect(calledWith.contents.length).toBeLessThanOrEqual(8000);
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

describe("generateMultimodalEmbedding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends text + images as parts array", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [3, 4] }],
    });

    await generateMultimodalEmbedding("hello", [
      { base64: "abc123", mimeType: "image/jpeg" },
    ]);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.contents).toEqual({
      parts: [
        { text: "hello" },
        { inlineData: { mimeType: "image/jpeg", data: "abc123" } },
      ],
    });
  });

  it("text part is first in parts array", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });

    await generateMultimodalEmbedding("first", [
      { base64: "img", mimeType: "image/png" },
    ]);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.contents.parts[0]).toHaveProperty("text");
  });

  it("image parts use inlineData format", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });

    await generateMultimodalEmbedding("text", [
      { base64: "base64data", mimeType: "image/webp" },
    ]);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    const imagePart = calledWith.contents.parts[1];
    expect(imagePart.inlineData).toHaveProperty("mimeType", "image/webp");
    expect(imagePart.inlineData).toHaveProperty("data", "base64data");
  });

  it("returns L2-normalized vector", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [3, 4] }],
    });

    const result = await generateMultimodalEmbedding("text", [
      { base64: "img", mimeType: "image/jpeg" },
    ]);
    const magnitude = Math.sqrt(result.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1.0, 5);
  });

  it("truncates text to MAX_INPUT_LENGTH", async () => {
    const longText = "a".repeat(10000);
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1] }],
    });

    await generateMultimodalEmbedding(longText, []);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.contents.parts[0].text.length).toBeLessThanOrEqual(8000);
  });

  it("uses RETRIEVAL_DOCUMENT as default taskType", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });

    await generateMultimodalEmbedding("text", []);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.config.taskType).toBe("RETRIEVAL_DOCUMENT");
  });

  it("passes RETRIEVAL_QUERY when specified", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });

    await generateMultimodalEmbedding("text", [], "RETRIEVAL_QUERY");

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.config.taskType).toBe("RETRIEVAL_QUERY");
  });

  it("throws on empty embeddings response", async () => {
    mockEmbedContent.mockResolvedValueOnce({ embeddings: [] });

    await expect(
      generateMultimodalEmbedding("text", [])
    ).rejects.toThrow("No multimodal embedding");
  });

  it("throws on null values in embedding", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: null }],
    });

    await expect(
      generateMultimodalEmbedding("text", [])
    ).rejects.toThrow("No multimodal embedding");
  });

  it("handles zero images (text-only parts)", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });

    await generateMultimodalEmbedding("text only", []);

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.contents.parts).toHaveLength(1);
    expect(calledWith.contents.parts[0]).toHaveProperty("text", "text only");
  });
});

describe("EMBEDDING_MODEL", () => {
  it("exports EMBEDDING_MODEL", () => {
    expect(typeof EMBEDDING_MODEL).toBe("string");
  });

  it("equals gemini-embedding-2-preview", () => {
    expect(EMBEDDING_MODEL).toBe("gemini-embedding-2-preview");
  });

  it("uses MODEL constant in embedContent calls", async () => {
    mockEmbedContent.mockResolvedValueOnce({
      embeddings: [{ values: [1, 0] }],
    });

    await generateEmbedding("test");

    const calledWith = mockEmbedContent.mock.calls[0][0];
    expect(calledWith.model).toContain(EMBEDDING_MODEL);
  });
});
