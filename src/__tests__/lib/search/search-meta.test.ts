jest.mock("@/lib/embeddings/version", () => ({
  getCurrentEmbeddingVersion: jest.fn(() => "gemini-embedding-2-preview"),
}));

import { getSearchV2VersionMeta } from "@/lib/search/meta";
import { SEARCH_DOC_PROJECTION_VERSION } from "@/lib/search/search-doc-sync";

describe("getSearchV2VersionMeta", () => {
  it("includes projectionVersion when SearchDoc-backed reads are active", () => {
    expect(
      getSearchV2VersionMeta({
        useSearchDoc: true,
        usedSemanticSearch: false,
      })
    ).toEqual({
      projectionVersion: SEARCH_DOC_PROJECTION_VERSION,
    });
  });

  it("includes both projectionVersion and embeddingVersion when semantic search is active", () => {
    expect(
      getSearchV2VersionMeta({
        useSearchDoc: false,
        usedSemanticSearch: true,
      })
    ).toEqual({
      projectionVersion: SEARCH_DOC_PROJECTION_VERSION,
      embeddingVersion: "gemini-embedding-2-preview",
    });
  });
});
