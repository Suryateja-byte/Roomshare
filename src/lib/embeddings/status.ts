export const PUBLISHED_EMBEDDING_STATUSES = ["COMPLETED", "PARTIAL"] as const;

export type PublishedEmbeddingStatus =
  (typeof PUBLISHED_EMBEDDING_STATUSES)[number];

export function isPublishedEmbeddingStatus(
  status: string | null | undefined
): status is PublishedEmbeddingStatus {
  return PUBLISHED_EMBEDDING_STATUSES.includes(
    status as PublishedEmbeddingStatus
  );
}

export function resolveEmbeddingStatus(input: {
  imageEmbeddingsEnabled: boolean;
  imageUrlCount: number;
  processedImageCount: number;
}): PublishedEmbeddingStatus {
  const expectedImages = input.imageEmbeddingsEnabled
    ? Math.min(input.imageUrlCount, 5)
    : 0;

  return expectedImages > 0 && input.processedImageCount < expectedImages
    ? "PARTIAL"
    : "COMPLETED";
}
