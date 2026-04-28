import {
  isPublishedEmbeddingStatus,
  resolveEmbeddingStatus,
} from "@/lib/embeddings/status";

describe("embedding status helpers", () => {
  it("treats COMPLETED and PARTIAL as published statuses", () => {
    expect(isPublishedEmbeddingStatus("COMPLETED")).toBe(true);
    expect(isPublishedEmbeddingStatus("PARTIAL")).toBe(true);
    expect(isPublishedEmbeddingStatus("PENDING")).toBe(false);
    expect(isPublishedEmbeddingStatus("FAILED")).toBe(false);
    expect(isPublishedEmbeddingStatus(null)).toBe(false);
  });

  it("returns PARTIAL when image embeddings are enabled and some expected images failed", () => {
    expect(
      resolveEmbeddingStatus({
        imageEmbeddingsEnabled: true,
        imageUrlCount: 3,
        processedImageCount: 1,
      })
    ).toBe("PARTIAL");
  });

  it("caps expected images at the processing limit", () => {
    expect(
      resolveEmbeddingStatus({
        imageEmbeddingsEnabled: true,
        imageUrlCount: 8,
        processedImageCount: 5,
      })
    ).toBe("COMPLETED");
  });

  it("returns COMPLETED when image embeddings are disabled", () => {
    expect(
      resolveEmbeddingStatus({
        imageEmbeddingsEnabled: false,
        imageUrlCount: 3,
        processedImageCount: 0,
      })
    ).toBe("COMPLETED");
  });
});
