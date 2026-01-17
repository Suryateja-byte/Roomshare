/**
 * Full-Text Search (FTS) Query Tests
 *
 * Tests the FTS implementation on listing_search_docs.search_tsv column.
 *
 * Architecture:
 * - search_tsv is a tsvector column with weighted fields:
 *   A: title (highest relevance)
 *   B: city, state (medium relevance)
 *   C: description (lower relevance)
 * - Queries use plainto_tsquery('english', $query) for AND-based multi-word search
 * - GIN index (search_doc_tsv_gin_idx) enables fast full-text matching
 *
 * @see prisma/migrations/20260116000000_search_doc_fts/migration.sql
 */

import { sanitizeSearchQuery, isValidQuery } from "@/lib/data";

describe("FTS Query Helpers", () => {
  describe("sanitizeSearchQuery for FTS", () => {
    it("preserves simple search terms for plainto_tsquery", () => {
      // plainto_tsquery handles these directly
      expect(sanitizeSearchQuery("san francisco")).toBe("san francisco");
      expect(sanitizeSearchQuery("cozy room")).toBe("cozy room");
    });

    it("trims whitespace", () => {
      expect(sanitizeSearchQuery("  downtown  ")).toBe("downtown");
    });

    it("handles unicode characters for international search", () => {
      // FTS with 'english' config handles common languages
      expect(sanitizeSearchQuery("café")).toBe("café");
      expect(sanitizeSearchQuery("北京")).toBe("北京");
    });

    it("removes SQL-dangerous characters safely", () => {
      // Semicolons, quotes, and SQL comments are stripped
      const result = sanitizeSearchQuery("test'; DROP TABLE --");
      expect(result).not.toContain(";");
      expect(result).not.toContain("'");
      expect(result).not.toContain("--");
      // Note: "DROP" and "TABLE" are kept as they're valid search terms
      // The danger comes from the semicolon/quotes, not the words
      expect(result).toContain("DROP");
    });

    it("returns empty string for invalid input", () => {
      expect(sanitizeSearchQuery("")).toBe("");
      expect(sanitizeSearchQuery("   ")).toBe("");
    });
  });

  describe("isValidQuery for FTS", () => {
    it("accepts queries of minimum length", () => {
      expect(isValidQuery("sf")).toBe(true);
      expect(isValidQuery("la")).toBe(true);
    });

    it("rejects queries that are too short", () => {
      expect(isValidQuery("a")).toBe(false);
      expect(isValidQuery("")).toBe(false);
    });

    it("truncates and validates long queries", () => {
      // Long queries are truncated by sanitizeSearchQuery (MAX_QUERY_LENGTH=200)
      // but still pass isValidQuery since the truncated result is >= MIN_QUERY_LENGTH
      const longQuery = "a".repeat(300);
      expect(isValidQuery(longQuery)).toBe(true);
      // Verify truncation happens in sanitizeSearchQuery
      expect(sanitizeSearchQuery(longQuery).length).toBeLessThanOrEqual(200);
    });
  });
});

/**
 * Integration test notes:
 *
 * The FTS query uses this SQL pattern:
 *   d.search_tsv @@ plainto_tsquery('english', $1)
 *
 * Example valid queries:
 * - "san francisco" → matches listings with "san" AND "francisco" in title/city/state/description
 * - "cozy" → matches listings with "cozy" in any weighted field
 * - "downtown la" → matches listings with both "downtown" AND "la"
 *
 * plainto_tsquery behavior:
 * - Treats whitespace as AND (all terms must match)
 * - Ignores stop words (the, is, at, etc.)
 * - Applies stemming (searching "rooms" matches "room")
 * - Case-insensitive
 *
 * If search_tsv column is NULL (pre-migration data), queries will return no matches
 * for that row. The migration backfills existing data, but new insertions are
 * automatically handled by the trigger.
 */
