/**
 * Tests for SearchDoc Query Functions
 *
 * Tests the feature flag logic and SearchDoc query structure.
 */

import { isSearchDocEnabled } from "@/lib/search/search-doc-queries";

describe("search-doc-queries", () => {
  describe("isSearchDocEnabled", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      // Reset environment before each test
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    describe("URL override takes precedence", () => {
      it("returns true when URL param is '1'", () => {
        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled("1")).toBe(true);
      });

      it("returns true when URL param is 'true'", () => {
        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled("true")).toBe(true);
      });

      it("returns false when URL param is '0'", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled("0")).toBe(false);
      });

      it("returns false when URL param is 'false'", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled("false")).toBe(false);
      });
    });

    describe("environment variable fallback", () => {
      it("returns true when env is 'true' and no URL override", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled(null)).toBe(true);
        expect(isSearchDocEnabled(undefined)).toBe(true);
        expect(isSearchDocEnabled("")).toBe(true);
      });

      it("returns false when env is 'false' and no URL override", () => {
        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled(null)).toBe(false);
        expect(isSearchDocEnabled(undefined)).toBe(false);
      });

      it("returns false when env is not set", () => {
        delete process.env.ENABLE_SEARCH_DOC;
        expect(isSearchDocEnabled(null)).toBe(false);
        expect(isSearchDocEnabled(undefined)).toBe(false);
      });

      it("returns false for invalid env values", () => {
        process.env.ENABLE_SEARCH_DOC = "yes";
        expect(isSearchDocEnabled(null)).toBe(false);

        process.env.ENABLE_SEARCH_DOC = "1";
        expect(isSearchDocEnabled(null)).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("handles empty string URL param as no override", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        expect(isSearchDocEnabled("")).toBe(true);

        process.env.ENABLE_SEARCH_DOC = "false";
        expect(isSearchDocEnabled("")).toBe(false);
      });

      it("handles whitespace URL param as no override", () => {
        process.env.ENABLE_SEARCH_DOC = "true";
        // Whitespace is not a valid override value
        expect(isSearchDocEnabled(" ")).toBe(true);
      });
    });
  });
});
