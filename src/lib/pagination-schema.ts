/**
 * Shared pagination schema and utilities (P1-02, P1-03)
 *
 * Provides cursor-based pagination with:
 * - Default limit: 20
 * - Max limit: 100
 * - Cursor validation (alphanumeric + hyphens only)
 */

import { z } from 'zod';

// Cursor must be alphanumeric with hyphens only (no special characters/XSS)
const cursorPattern = /^[a-zA-Z0-9-]+$/;

export const paginationSchema = z.object({
  cursor: z
    .string()
    .optional()
    .refine(
      (val) => !val || cursorPattern.test(val),
      { message: 'Invalid cursor format' }
    ),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 20; // Default
      const num = parseInt(val, 10);
      if (isNaN(num)) return null; // Will fail validation
      return num;
    })
    .refine(
      (val) => val !== null,
      { message: 'limit must be a valid number' }
    )
    .refine(
      (val) => val === null || val >= 1,
      { message: 'limit must be at least 1' }
    )
    .transform((val) => Math.min(val as number, 100)), // Cap at 100
});

export type PaginationParams = {
  cursor?: string;
  limit: number;
};

/**
 * Parse and validate pagination parameters from URL search params
 */
export function parsePaginationParams(searchParams: URLSearchParams): {
  success: true;
  data: PaginationParams;
} | {
  success: false;
  error: string;
} {
  const cursor = searchParams.get('cursor') || undefined;
  const limit = searchParams.get('limit') || undefined;

  const result = paginationSchema.safeParse({ cursor, limit });

  if (!result.success) {
    const firstError = result.error.issues[0];
    return {
      success: false,
      error: firstError?.message || 'Invalid pagination parameters',
    };
  }

  return {
    success: true,
    data: {
      cursor: result.data.cursor,
      limit: result.data.limit as number,
    },
  };
}

/**
 * Build pagination response metadata
 */
export function buildPaginationResponse<T extends { id: string }>(
  items: T[],
  limit: number,
  total: number
): {
  items: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    total: number;
  };
} {
  // We fetch limit + 1 to check if there are more items
  const hasMore = items.length > limit;
  const returnedItems = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && returnedItems.length > 0
    ? returnedItems[returnedItems.length - 1].id
    : null;

  return {
    items: returnedItems,
    pagination: {
      hasMore,
      nextCursor,
      total,
    },
  };
}

/**
 * Build Prisma query options for cursor-based pagination
 */
export function buildPrismaQueryOptions(params: PaginationParams): {
  take: number;
  cursor?: { id: string };
  skip?: number;
} {
  const options: {
    take: number;
    cursor?: { id: string };
    skip?: number;
  } = {
    take: params.limit + 1, // +1 to check for hasMore
  };

  if (params.cursor) {
    options.cursor = { id: params.cursor };
    options.skip = 1; // Skip the cursor item itself
  }

  return options;
}
