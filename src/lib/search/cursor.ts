/**
 * Search API v2 - Keyset Cursor Utilities
 *
 * Provides stable keyset/cursor pagination to prevent result drift
 * (duplicates/missing items) when inventory changes during scrolling.
 *
 * Key design decisions:
 * - Versioned cursor format for future compatibility
 * - Sort-specific key values stored in ORDER BY sequence
 * - Float/decimal values stored as strings to preserve DB precision
 * - Tie-breaker (id) ensures deterministic ordering
 * - Browser-compatible base64url encoding (no Node Buffer dependency)
 */

import { z } from "zod";
import { createHmac, timingSafeEqual } from "crypto";
import { CURSOR_SECRET } from "@/lib/env";

// ============================================================================
// Browser-compatible Base64url Encoding
// ============================================================================

/**
 * Encode a string to base64url (browser-compatible, no Buffer dependency).
 * Base64url differs from base64: '+' → '-', '/' → '_', no padding.
 */
function toBase64Url(str: string): string {
  // Use TextEncoder for proper UTF-8 encoding
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
  const base64 = btoa(binString);
  // Convert to base64url
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode a base64url string (browser-compatible, no Buffer dependency).
 */
function fromBase64Url(base64url: string): string {
  // Convert from base64url to base64
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  const padLength = (4 - (base64.length % 4)) % 4;
  base64 += "=".repeat(padLength);
  // Decode
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (char) => char.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

// ============================================================================
// Types
// ============================================================================

/**
 * Valid sort options for search v2.
 * Must match the sort options in search-doc-queries.ts
 */
export type SortOption =
  | "recommended"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "rating";

export const SORT_OPTIONS: readonly SortOption[] = [
  "recommended",
  "newest",
  "price_asc",
  "price_desc",
  "rating",
] as const;

/**
 * Keyset cursor structure for pagination.
 *
 * - v: Version number for future format changes
 * - s: Sort option to validate cursor matches current query
 * - k: Key values in ORDER BY column sequence (as strings for float precision)
 * - id: Tie-breaker listing ID (CUID)
 */
export interface KeysetCursor {
  v: 1;
  s: SortOption;
  k: (string | null)[];
  id: string;
}

// ============================================================================
// Zod Schema
// ============================================================================

/**
 * Zod schema for validating decoded cursor payloads.
 * Strict validation ensures malformed cursors are rejected.
 */
const KeysetCursorSchema = z
  .object({
    v: z.literal(1),
    s: z.enum(["recommended", "newest", "price_asc", "price_desc", "rating"]),
    k: z.array(z.union([z.string(), z.null()])),
    id: z.string().min(1),
  })
  .strict();

/**
 * Expected key counts per sort option.
 * Used for validation to ensure cursor matches sort requirements.
 */
const EXPECTED_KEY_COUNTS: Record<SortOption, number> = {
  recommended: 2, // recommended_score, listing_created_at
  newest: 1, // listing_created_at
  price_asc: 2, // price, listing_created_at
  price_desc: 2, // price, listing_created_at
  rating: 3, // avg_rating, review_count, listing_created_at
};

// ============================================================================
// Encoding/Decoding
// ============================================================================

/**
 * Encode a keyset cursor as a base64url string.
 *
 * @param cursor - The keyset cursor object
 * @returns Base64url encoded cursor string
 */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
  const payload = JSON.stringify(cursor);
  if (!CURSOR_SECRET) {
    return toBase64Url(payload);
  }

  const signature = createHmac("sha256", CURSOR_SECRET)
    .update(payload)
    .digest("base64url");
  const envelope = JSON.stringify({ p: payload, s: signature });
  return toBase64Url(envelope);
}

/**
 * Decode a base64url string to a keyset cursor.
 *
 * Returns null if:
 * - Cursor is not valid base64url
 * - JSON parsing fails
 * - Schema validation fails
 * - Sort option doesn't match expected
 * - Key count doesn't match sort requirements
 *
 * @param cursorStr - Base64url encoded cursor string
 * @param expectedSort - Optional sort option to validate against
 * @returns Decoded cursor or null if invalid
 */
export function decodeKeysetCursor(
  cursorStr: string,
  expectedSort?: SortOption,
): KeysetCursor | null {
  try {
    const decoded = fromBase64Url(cursorStr);
    let payload = decoded;

    if (CURSOR_SECRET) {
      const parsedEnvelope = JSON.parse(decoded) as unknown;
      if (
        parsedEnvelope === null ||
        typeof parsedEnvelope !== "object" ||
        !("p" in parsedEnvelope) ||
        !("s" in parsedEnvelope) ||
        typeof parsedEnvelope.p !== "string" ||
        typeof parsedEnvelope.s !== "string"
      ) {
        return null;
      }

      const expectedSignature = createHmac("sha256", CURSOR_SECRET)
        .update(parsedEnvelope.p)
        .digest("base64url");

      const provided = Buffer.from(parsedEnvelope.s);
      const expected = Buffer.from(expectedSignature);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return null;
      }

      payload = parsedEnvelope.p;
    } else {
      const parsedEnvelope = JSON.parse(decoded) as unknown;
      if (
        parsedEnvelope !== null &&
        typeof parsedEnvelope === "object" &&
        "p" in parsedEnvelope &&
        "s" in parsedEnvelope &&
        typeof parsedEnvelope.p === "string"
      ) {
        payload = parsedEnvelope.p;
      }
    }

    const parsed = JSON.parse(payload);

    // Validate against Zod schema
    const result = KeysetCursorSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }

    const cursor = result.data;

    // Validate sort matches if expected sort is provided
    if (expectedSort && cursor.s !== expectedSort) {
      return null;
    }

    // Validate key count matches sort requirements
    const expectedKeyCount = EXPECTED_KEY_COUNTS[cursor.s];
    if (cursor.k.length !== expectedKeyCount) {
      return null;
    }

    return cursor;
  } catch {
    return null;
  }
}

// ============================================================================
// Cursor Building from Query Results
// ============================================================================

/**
 * Row data needed to build a cursor.
 * All numeric values should be converted to strings for precision.
 */
export interface CursorRowData {
  id: string;
  listing_created_at: string; // ISO date string
  recommended_score?: string | null; // As string for float precision
  price?: string | null; // As string for decimal precision
  avg_rating?: string | null; // As string for float precision
  review_count?: string | null; // As string (integer)
}

/**
 * Build a keyset cursor from the last row of a query result.
 *
 * Key values are stored as strings to preserve exact DB representation
 * and avoid float precision issues during JSON roundtrip.
 *
 * @param row - The last row from query results
 * @param sort - The sort option used for the query
 * @returns KeysetCursor ready for encoding
 */
export function buildCursorFromRow(
  row: CursorRowData,
  sort: SortOption,
): KeysetCursor {
  let keys: (string | null)[];

  switch (sort) {
    case "recommended":
      // ORDER BY: recommended_score DESC, listing_created_at DESC, id ASC
      keys = [row.recommended_score ?? null, row.listing_created_at];
      break;

    case "newest":
      // ORDER BY: listing_created_at DESC, id ASC
      keys = [row.listing_created_at];
      break;

    case "price_asc":
    case "price_desc":
      // ORDER BY: price ASC/DESC, listing_created_at DESC, id ASC
      keys = [row.price ?? null, row.listing_created_at];
      break;

    case "rating":
      // ORDER BY: avg_rating DESC, review_count DESC, listing_created_at DESC, id ASC
      keys = [
        row.avg_rating ?? null,
        row.review_count ?? null,
        row.listing_created_at,
      ];
      break;

    default:
      // Fallback to recommended
      keys = [row.recommended_score ?? null, row.listing_created_at];
  }

  return {
    v: 1,
    s: sort,
    k: keys,
    id: row.id,
  };
}

// ============================================================================
// Cursor Stack (for bidirectional keyset pagination)
// ============================================================================

/**
 * Encode an array of cursor strings as a single base64url string.
 * Used to store navigation history in URL for "back" navigation.
 *
 * @param cursors - Array of cursor strings
 * @returns Base64url encoded JSON array, or empty string if no cursors
 */
export function encodeStack(cursors: string[]): string {
  if (cursors.length === 0) return "";
  return toBase64Url(JSON.stringify(cursors));
}

/**
 * Decode a base64url string to an array of cursor strings.
 * Used to restore navigation history from URL.
 *
 * @param encoded - Base64url encoded JSON array
 * @returns Array of cursor strings, or empty array if invalid
 */
export function decodeStack(encoded: string): string[] {
  if (!encoded) return [];
  try {
    const json = fromBase64Url(encoded);
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

// ============================================================================
// Legacy Cursor Detection
// ============================================================================

/**
 * Legacy cursor format from offset-based pagination.
 * Used for backward compatibility during migration.
 */
interface LegacyCursor {
  p: number;
}

/**
 * Check if a cursor string is a legacy offset-based cursor.
 *
 * @param cursorStr - Base64url encoded cursor string
 * @returns Page number if legacy cursor, null otherwise
 */
export function decodeLegacyCursor(cursorStr: string): number | null {
  try {
    const payload = fromBase64Url(cursorStr);
    const parsed = JSON.parse(payload) as unknown;

    // Legacy format: { p: number }
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "p" in parsed &&
      typeof (parsed as LegacyCursor).p === "number" &&
      (parsed as LegacyCursor).p > 0 &&
      !("v" in parsed) // Distinguish from keyset cursor
    ) {
      return (parsed as LegacyCursor).p;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Attempt to decode a cursor, detecting whether it's keyset or legacy format.
 *
 * This enables backward compatibility during rollout:
 * - Legacy cursors ({p: n}) → return page number for offset fetch
 * - Keyset cursors → return cursor for keyset fetch
 *
 * @param cursorStr - Base64url encoded cursor string
 * @param expectedSort - Sort option to validate keyset cursor against
 * @returns Object with either 'keyset' or 'legacy' property, or null if invalid
 */
export function decodeCursorAny(
  cursorStr: string,
  expectedSort: SortOption,
):
  | { type: "keyset"; cursor: KeysetCursor }
  | { type: "legacy"; page: number }
  | null {
  // Try keyset first (newer format)
  const keysetCursor = decodeKeysetCursor(cursorStr, expectedSort);
  if (keysetCursor) {
    return { type: "keyset", cursor: keysetCursor };
  }

  // Fall back to legacy format
  const legacyPage = decodeLegacyCursor(cursorStr);
  if (legacyPage !== null) {
    return { type: "legacy", page: legacyPage };
  }

  return null;
}
