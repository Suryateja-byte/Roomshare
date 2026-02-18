/**
 * Search API v2 - Query Hash and Cursor Utilities
 *
 * Provides stable cache key generation and cursor encoding for pagination.
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { BOUNDS_EPSILON } from "./types";
import { CURSOR_SECRET } from "@/lib/env";

// ============================================================================
// Keyset Cursor Re-exports
// ============================================================================

// Re-export keyset cursor utilities for backward compatibility
// New code should import directly from cursor.ts
export {
  encodeKeysetCursor,
  decodeKeysetCursor,
  buildCursorFromRow,
  decodeCursorAny,
  decodeLegacyCursor,
  SORT_OPTIONS,
  type KeysetCursor,
  type SortOption,
  type CursorRowData,
} from "./cursor";

// ============================================================================
// Query Hash Generation
// ============================================================================

/**
 * Filter parameters used for hash generation.
 * Matches the shape from parseSearchParams().
 */
export interface HashableFilterParams {
  query?: string;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  houseRules?: string[];
  languages?: string[];
  roomType?: string;
  leaseDuration?: string;
  moveInDate?: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  nearMatches?: boolean;
}

/**
 * Quantize a coordinate value using BOUNDS_EPSILON for cache stability.
 * This ensures nearby queries (within ~100m) hit the same cache key.
 */
function quantizeBound(value: number): number {
  return Math.round(value / BOUNDS_EPSILON) * BOUNDS_EPSILON;
}

/**
 * Generate a stable 16-character hash from filter parameters.
 *
 * Key features:
 * - Bounds quantized with BOUNDS_EPSILON (0.001) for ~100m cache tolerance
 * - Arrays sorted for order-independence
 * - Strings lowercased for case-insensitivity
 * - Excludes pagination params (page, limit, cursor) for reusability
 */
export function generateQueryHash(params: HashableFilterParams): string {
  // Normalize params for stable hashing
  const normalized = {
    q: (params.query ?? "").toLowerCase().trim(),
    minPrice: params.minPrice ?? null,
    maxPrice: params.maxPrice ?? null,
    amenities: [...(params.amenities ?? [])].sort(),
    houseRules: [...(params.houseRules ?? [])].sort(),
    languages: [...(params.languages ?? [])].sort(),
    roomType: (params.roomType ?? "").toLowerCase(),
    leaseDuration: (params.leaseDuration ?? "").toLowerCase(),
    moveInDate: params.moveInDate ?? "",
    nearMatches: params.nearMatches ?? false,
    // Quantize bounds for cache stability
    bounds: params.bounds
      ? {
          minLat: quantizeBound(params.bounds.minLat),
          maxLat: quantizeBound(params.bounds.maxLat),
          minLng: quantizeBound(params.bounds.minLng),
          maxLng: quantizeBound(params.bounds.maxLng),
        }
      : null,
  };

  // Generate SHA256 hash and truncate to 16 chars
  const hash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");

  return hash.slice(0, 16);
}

// ============================================================================
// Cursor Encoding/Decoding
// ============================================================================

/**
 * Encode a page number as a base64url cursor.
 * Used for opaque pagination tokens in the API response.
 */
export function encodeCursor(page: number): string {
  const payload = JSON.stringify({ p: page });
  if (!CURSOR_SECRET) {
    return Buffer.from(payload).toString("base64url");
  }

  const signature = createHmac("sha256", CURSOR_SECRET)
    .update(payload)
    .digest("base64url");
  const envelope = JSON.stringify({ p: payload, s: signature });
  return Buffer.from(envelope).toString("base64url");
}

/**
 * Decode a base64url cursor to a page number.
 * Returns null if the cursor is invalid or malformed.
 */
export function decodeCursor(cursor: string): number | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
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

    if (typeof parsed?.p === "number" && parsed.p > 0) {
      return parsed.p;
    }
    return null;
  } catch {
    return null;
  }
}
