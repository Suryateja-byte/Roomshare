/**
 * Tests for pagination-schema utilities
 * Validates cursor-based pagination with input sanitization
 */

import {
  paginationSchema,
  parsePaginationParams,
  buildPaginationResponse,
  buildPrismaQueryOptions,
} from '@/lib/pagination-schema';

describe('pagination-schema', () => {
  describe('paginationSchema (zod)', () => {
    describe('cursor validation', () => {
      it('accepts undefined cursor', () => {
        const result = paginationSchema.safeParse({ cursor: undefined });
        expect(result.success).toBe(true);
      });

      it('accepts alphanumeric cursor', () => {
        const result = paginationSchema.safeParse({ cursor: 'abc123' });
        expect(result.success).toBe(true);
      });

      it('accepts cursor with hyphens (UUID format)', () => {
        const result = paginationSchema.safeParse({
          cursor: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        });
        expect(result.success).toBe(true);
      });

      it('rejects cursor with special characters', () => {
        const result = paginationSchema.safeParse({ cursor: 'abc!@#$' });
        expect(result.success).toBe(false);
      });

      it('rejects cursor with spaces', () => {
        const result = paginationSchema.safeParse({ cursor: 'abc def' });
        expect(result.success).toBe(false);
      });

      it('rejects cursor with SQL injection attempt', () => {
        const result = paginationSchema.safeParse({
          cursor: "'; DROP TABLE users; --",
        });
        expect(result.success).toBe(false);
      });

      it('rejects cursor with XSS attempt', () => {
        const result = paginationSchema.safeParse({
          cursor: '<script>alert(1)</script>',
        });
        expect(result.success).toBe(false);
      });

      it('rejects cursor with path traversal', () => {
        const result = paginationSchema.safeParse({
          cursor: '../../etc/passwd',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('limit validation', () => {
      it('defaults to 20 when no limit provided', () => {
        const result = paginationSchema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('defaults to 20 when limit is undefined', () => {
        const result = paginationSchema.safeParse({ limit: undefined });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('parses valid limit string', () => {
        const result = paginationSchema.safeParse({ limit: '50' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });

      it('caps limit at 100', () => {
        const result = paginationSchema.safeParse({ limit: '200' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(100);
        }
      });

      it('accepts minimum limit of 1', () => {
        const result = paginationSchema.safeParse({ limit: '1' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(1);
        }
      });

      it('rejects limit of 0', () => {
        const result = paginationSchema.safeParse({ limit: '0' });
        expect(result.success).toBe(false);
      });

      it('rejects negative limit', () => {
        const result = paginationSchema.safeParse({ limit: '-5' });
        expect(result.success).toBe(false);
      });

      it('rejects non-numeric limit string', () => {
        const result = paginationSchema.safeParse({ limit: 'abc' });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('parsePaginationParams', () => {
    it('parses valid params with cursor and limit', () => {
      const params = new URLSearchParams({ cursor: 'abc123', limit: '10' });
      const result = parsePaginationParams(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBe('abc123');
        expect(result.data.limit).toBe(10);
      }
    });

    it('parses with defaults when no params', () => {
      const params = new URLSearchParams();
      const result = parsePaginationParams(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBeUndefined();
        expect(result.data.limit).toBe(20);
      }
    });

    it('returns error for invalid cursor', () => {
      const params = new URLSearchParams({ cursor: '<script>' });
      const result = parsePaginationParams(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid cursor format');
      }
    });

    it('returns error for invalid limit', () => {
      const params = new URLSearchParams({ limit: 'not-a-number' });
      const result = parsePaginationParams(params);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });

    it('caps limit at 100', () => {
      const params = new URLSearchParams({ limit: '500' });
      const result = parsePaginationParams(params);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it('rejects SQL injection in cursor param', () => {
      const params = new URLSearchParams({
        cursor: "1; DROP TABLE listings;--",
      });
      const result = parsePaginationParams(params);

      expect(result.success).toBe(false);
    });
  });

  describe('buildPaginationResponse', () => {
    const makeItems = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ id: `item-${i}` }));

    it('returns items with hasMore=false when items <= limit', () => {
      const items = makeItems(5);
      const result = buildPaginationResponse(items, 10, 5);

      expect(result.items).toHaveLength(5);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.total).toBe(5);
    });

    it('returns hasMore=true and trims when items > limit', () => {
      // We fetch limit+1 to detect hasMore, so 11 items with limit=10
      const items = makeItems(11);
      const result = buildPaginationResponse(items, 10, 25);

      expect(result.items).toHaveLength(10);
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.nextCursor).toBe('item-9');
      expect(result.pagination.total).toBe(25);
    });

    it('returns hasMore=false when items exactly equal limit', () => {
      const items = makeItems(10);
      const result = buildPaginationResponse(items, 10, 10);

      expect(result.items).toHaveLength(10);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
    });

    it('handles empty items array', () => {
      const result = buildPaginationResponse([], 10, 0);

      expect(result.items).toHaveLength(0);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.nextCursor).toBeNull();
      expect(result.pagination.total).toBe(0);
    });

    it('uses last item ID as nextCursor', () => {
      const items = [
        { id: 'first' },
        { id: 'second' },
        { id: 'third' },
        { id: 'fourth' },
      ];
      // 4 items with limit=3 means hasMore
      const result = buildPaginationResponse(items, 3, 10);

      expect(result.pagination.nextCursor).toBe('third');
    });
  });

  describe('buildPrismaQueryOptions', () => {
    it('returns take = limit + 1 without cursor', () => {
      const result = buildPrismaQueryOptions({ limit: 20 });

      expect(result.take).toBe(21);
      expect(result.cursor).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });

    it('includes cursor and skip when cursor provided', () => {
      const result = buildPrismaQueryOptions({
        cursor: 'item-123',
        limit: 10,
      });

      expect(result.take).toBe(11);
      expect(result.cursor).toEqual({ id: 'item-123' });
      expect(result.skip).toBe(1);
    });

    it('does not include cursor when cursor is undefined', () => {
      const result = buildPrismaQueryOptions({
        cursor: undefined,
        limit: 5,
      });

      expect(result.cursor).toBeUndefined();
      expect(result.skip).toBeUndefined();
    });
  });
});
