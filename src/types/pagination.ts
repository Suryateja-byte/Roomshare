/**
 * Pagination Types for Hybrid Keyset/Offset Pagination
 *
 * Keyset pagination is used for stable sorts (newest, price_asc, price_desc)
 * Offset pagination is used for computed sorts (recommended, rating)
 *
 * This hybrid approach provides:
 * - No duplicate items across pages for keyset-eligible sorts
 * - Efficient queries without OFFSET performance degradation
 * - Full pagination UI for computed sorts where keyset isn't possible
 */

/** Sorts eligible for keyset pagination (stable column values) */
export const KEYSET_SORTS = ["newest", "price_asc", "price_desc"] as const;

/** Sorts that require offset pagination (computed aggregates) */
export const OFFSET_SORTS = ["recommended", "rating"] as const;

export type KeysetSort = (typeof KEYSET_SORTS)[number];
export type OffsetSort = (typeof OFFSET_SORTS)[number];
export type SortOption = KeysetSort | OffsetSort;

/**
 * Check if a sort option is eligible for keyset pagination.
 *
 * @param sort - The sort option to check
 * @returns true if keyset pagination can be used
 */
export function isKeysetEligible(sort: string): sort is KeysetSort {
  return KEYSET_SORTS.includes(sort as KeysetSort);
}

/**
 * Cursor structure for keyset pagination.
 *
 * Contains the last item's sort value and ID for deterministic pagination.
 * The sortValue type depends on the sort:
 * - newest: Date ISO string (createdAt)
 * - price_asc/price_desc: number (price)
 */
export interface KeysetCursor {
  /** The sort column value (price or createdAt) */
  sortValue: number | string;
  /** The listing ID for tie-breaking */
  id: string;
  /** The sort type this cursor was created for */
  sort: KeysetSort;
}

/**
 * Encode a cursor to a URL-safe base64 string.
 *
 * @param cursor - The cursor to encode
 * @returns URL-safe base64 encoded cursor string
 *
 * @example
 * ```ts
 * const cursor = { sortValue: 1200, id: "listing-123", sort: "price_asc" };
 * const encoded = encodeCursor(cursor);
 * // Returns: "eyJzb3J0VmFsdWUiOjEyMDAsImlkIjoibGlzdGluZy0xMjMiLCJzb3J0IjoicHJpY2VfYXNjIn0"
 * ```
 */
export function encodeCursor(cursor: KeysetCursor): string {
  const json = JSON.stringify(cursor);
  // Use base64url encoding (URL-safe: no +, /, or = padding)
  return Buffer.from(json).toString("base64url");
}

/**
 * Decode a cursor from a URL-safe base64 string.
 *
 * @param encoded - The encoded cursor string
 * @returns The decoded cursor, or null if invalid
 *
 * @example
 * ```ts
 * const cursor = decodeCursor("eyJzb3J0VmFsdWUiOjEyMDAsImlkIjoibGlzdGluZy0xMjMiLCJzb3J0IjoicHJpY2VfYXNjIn0");
 * // Returns: { sortValue: 1200, id: "listing-123", sort: "price_asc" }
 * ```
 */
export function decodeCursor(encoded: string): KeysetCursor | null {
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);

    // Validate cursor structure
    if (!isValidCursor(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Validate cursor structure at runtime.
 */
function isValidCursor(obj: unknown): obj is KeysetCursor {
  if (!obj || typeof obj !== "object") return false;

  const cursor = obj as Record<string, unknown>;

  // Check required fields
  if (!("sortValue" in cursor) || !("id" in cursor) || !("sort" in cursor)) {
    return false;
  }

  // Validate types
  if (
    typeof cursor.sortValue !== "number" &&
    typeof cursor.sortValue !== "string"
  ) {
    return false;
  }
  if (typeof cursor.id !== "string" || cursor.id.length === 0) {
    return false;
  }
  if (!isKeysetEligible(cursor.sort as string)) {
    return false;
  }

  return true;
}

/**
 * Create a cursor from a listing item.
 *
 * @param item - The listing item (must have id, price, createdAt)
 * @param sort - The sort type
 * @returns Encoded cursor string
 */
export function createCursorFromItem(
  item: { id: string; price?: number; createdAt?: Date | string },
  sort: KeysetSort,
): string {
  let sortValue: number | string;

  switch (sort) {
    case "price_asc":
    case "price_desc":
      if (item.price === undefined) {
        throw new Error("Price is required for price-based cursor");
      }
      sortValue = item.price;
      break;
    case "newest":
      if (!item.createdAt) {
        throw new Error("createdAt is required for newest cursor");
      }
      sortValue =
        item.createdAt instanceof Date
          ? item.createdAt.toISOString()
          : item.createdAt;
      break;
  }

  return encodeCursor({ sortValue, id: item.id, sort });
}

/**
 * Keyset pagination result with cursor-based navigation.
 */
export interface KeysetPaginatedResult<T> {
  items: T[];
  /** Cursor for the next page (null if no more pages) */
  nextCursor: string | null;
  /** Whether there are more items after this page */
  hasNextPage: boolean;
  /** Whether there are items before this page */
  hasPrevPage?: boolean;
  /** The sort used for this result */
  sort: KeysetSort;
  /** Items per page */
  limit: number;
}

/**
 * Offset pagination result (for computed sorts).
 */
export interface OffsetPaginatedResult<T> {
  items: T[];
  /** Exact total if ≤100, null if >100 (unknown) */
  total: number | null;
  /** Exact total pages if known, null otherwise */
  totalPages: number | null;
  /** Always known via limit+1 pattern */
  hasNextPage: boolean;
  /** Always known: page > 1 */
  hasPrevPage: boolean;
  /** Current page number (1-indexed) */
  page: number;
  /** Items per page */
  limit: number;
  /** The sort used for this result */
  sort: OffsetSort;
}

/**
 * Union type for pagination results.
 * Use `isKeysetResult` to discriminate between types.
 */
export type PaginationResult<T> =
  | KeysetPaginatedResult<T>
  | OffsetPaginatedResult<T>;

/**
 * Type guard to check if a result is keyset-paginated.
 */
export function isKeysetResult<T>(
  result: PaginationResult<T>,
): result is KeysetPaginatedResult<T> {
  return "nextCursor" in result;
}

/**
 * Type guard to check if a result is offset-paginated.
 */
export function isOffsetResult<T>(
  result: PaginationResult<T>,
): result is OffsetPaginatedResult<T> {
  return "page" in result && "total" in result;
}
