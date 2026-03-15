/**
 * Tests for semantic search feature flag dependencies.
 * Verifies ENABLE_IMAGE_EMBEDDINGS requires ENABLE_SEMANTIC_SEARCH.
 *
 * Uses jest.resetModules + dynamic import to test env validation
 * with different env var combinations (same pattern as multi-slot booking tests).
 */

describe("semantic search feature flag dependencies", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      // Minimum required env vars for validation to not throw on unrelated fields
      DATABASE_URL: "postgresql://test",
      NEXTAUTH_SECRET: "a".repeat(32),
      NEXTAUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
      NODE_ENV: "test",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("valid: both SEMANTIC_SEARCH and IMAGE_EMBEDDINGS enabled", () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "true";
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true";

    // Should not throw
    const { features } = require("@/lib/env");
    expect(features.semanticSearch).toBe(true);
    expect(features.imageEmbeddings).toBe(true);
  });

  it("valid: SEMANTIC_SEARCH only (no image embeddings)", () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "true";
    process.env.ENABLE_IMAGE_EMBEDDINGS = "false";

    const { features } = require("@/lib/env");
    expect(features.semanticSearch).toBe(true);
    expect(features.imageEmbeddings).toBe(false);
  });

  it("imageEmbeddings returns false when SEMANTIC_SEARCH is false", () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "false";
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true";

    const { features } = require("@/lib/env");
    expect(features.semanticSearch).toBe(false);
    // imageEmbeddings requires semanticSearch — should be false
    expect(features.imageEmbeddings).toBe(false);
  });

  it("valid: both disabled", () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "false";
    process.env.ENABLE_IMAGE_EMBEDDINGS = "false";

    const { features } = require("@/lib/env");
    expect(features.semanticSearch).toBe(false);
    expect(features.imageEmbeddings).toBe(false);
  });

  it("valid: neither flag set (undefined)", () => {
    delete process.env.ENABLE_SEMANTIC_SEARCH;
    delete process.env.ENABLE_IMAGE_EMBEDDINGS;

    const { features } = require("@/lib/env");
    expect(features.semanticSearch).toBe(false);
    expect(features.imageEmbeddings).toBe(false);
  });
});

describe("features.imageEmbeddings getter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgresql://test",
      NEXTAUTH_SECRET: "a".repeat(32),
      NEXTAUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
      NODE_ENV: "test",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns true only when both flags enabled", () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "true";
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true";

    const { features } = require("@/lib/env");
    expect(features.imageEmbeddings).toBe(true);
  });

  it("returns false when IMAGE_EMBEDDINGS=true but SEMANTIC_SEARCH=false", () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "false";
    process.env.ENABLE_IMAGE_EMBEDDINGS = "true";

    const { features } = require("@/lib/env");
    expect(features.imageEmbeddings).toBe(false);
  });

  it("returns false when IMAGE_EMBEDDINGS=false", () => {
    process.env.ENABLE_SEMANTIC_SEARCH = "true";
    process.env.ENABLE_IMAGE_EMBEDDINGS = "false";

    const { features } = require("@/lib/env");
    expect(features.imageEmbeddings).toBe(false);
  });

  it("returns false when neither flag set", () => {
    delete process.env.ENABLE_SEMANTIC_SEARCH;
    delete process.env.ENABLE_IMAGE_EMBEDDINGS;

    const { features } = require("@/lib/env");
    expect(features.imageEmbeddings).toBe(false);
  });
});
