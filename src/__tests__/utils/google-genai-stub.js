/**
 * Stub for @google/genai in Jest.
 *
 * The real package ships as ESM (.mjs) which Jest cannot parse without
 * experimental ESM support. Tests that directly test the Gemini wrapper
 * override this stub via jest.mock("@google/genai", () => ({ ... })).
 * Tests that transitively import gemini.ts (e.g., data.test.ts via
 * search-doc-queries.ts) get this no-op stub.
 */
module.exports = {
  GoogleGenAI: class GoogleGenAI {
    constructor() {
      this.models = {
        embedContent: async () => ({ embeddings: [{ values: [] }] }),
        batchEmbedContents: async () => ({ embeddings: [] }),
      };
    }
  },
};
