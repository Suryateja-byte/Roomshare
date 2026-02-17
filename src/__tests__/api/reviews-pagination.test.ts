/**
 * Tests for reviews pagination (P1-02)
 *
 * Verifies that:
 * 1. Default returns 20 items with cursor
 * 2. Custom limit (max 100) respected
 * 3. Invalid cursor returns 400
 * 4. Rate limit (60/min) enforced on GET
 * 5. Max comment length (5000 chars) enforced
 */

// Mock Prisma before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    review: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
    },
    listing: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/app/actions/suspension', () => ({
  checkSuspension: jest.fn().mockResolvedValue({ suspended: false }),
}));

jest.mock('@/lib/notifications', () => ({
  createInternalNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/email', () => ({
  sendNotificationEmailWithPreference: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/logger', () => ({
  logger: { sync: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } },
}));

jest.mock('@/lib/api-error-handler', () => ({
  captureApiError: jest.fn((_error, _context) => ({
    status: 500,
    json: async () => ({ error: 'Internal server error' }),
    headers: new Map(),
  })),
}));

jest.mock('@/lib/search/search-doc-dirty', () => ({
  markListingDirty: jest.fn().mockResolvedValue(undefined),
}));

// Mock next/server to avoid NextRequest issues in Jest
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => {
      return {
        status: init?.status || 200,
        json: async () => data,
        headers: new Map(Object.entries(init?.headers || {})),
      };
    },
  },
}));

// Mock rate limiting - configurable per test
const mockWithRateLimit = jest.fn();
jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: (...args: unknown[]) => mockWithRateLimit(...args),
}));

import { GET, POST } from '@/app/api/reviews/route';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// Helper to create mock request using native Request
function createMockRequest(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Request {
  return new Request(url, init);
}

// Generate mock reviews for pagination testing
function generateMockReviews(count: number, startIndex = 0): Array<{
  id: string;
  authorId: string;
  listingId: string;
  rating: number;
  comment: string;
  createdAt: Date;
  author: { name: string; image: string | null };
}> {
  return Array.from({ length: count }, (_, i) => ({
    id: `review-${startIndex + i}`,
    authorId: `author-${startIndex + i}`,
    listingId: 'listing-abc',
    rating: 4,
    comment: `Review comment ${startIndex + i}`,
    createdAt: new Date(Date.now() - (startIndex + i) * 1000 * 60 * 60),
    author: { name: `Author ${startIndex + i}`, image: null },
  }));
}

describe('Reviews Pagination (P1-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: allow all requests (no rate limiting)
    mockWithRateLimit.mockResolvedValue(null);
  });

  describe('GET /api/reviews - Pagination', () => {
    it('returns default 20 items when no limit specified', async () => {
      const mockReviews = generateMockReviews(25);
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews.slice(0, 21)); // +1 for hasMore check
      (prisma.review.count as jest.Mock).mockResolvedValue(25);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.reviews).toHaveLength(20);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.hasMore).toBe(true);
      expect(data.pagination.nextCursor).toBeDefined();
    });

    it('respects custom limit parameter up to max 100', async () => {
      const mockReviews = generateMockReviews(50);
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews.slice(0, 51));
      (prisma.review.count as jest.Mock).mockResolvedValue(50);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&limit=50');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.reviews).toHaveLength(50);
    });

    it('caps limit at 100 even if higher value requested', async () => {
      const mockReviews = generateMockReviews(150);
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews.slice(0, 101));
      (prisma.review.count as jest.Mock).mockResolvedValue(150);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&limit=200');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Should cap at 100
      expect(data.reviews.length).toBeLessThanOrEqual(100);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 101, // 100 + 1 for hasMore check
        })
      );
    });

    it('returns cursor for next page when more results exist', async () => {
      const mockReviews = generateMockReviews(25);
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews.slice(0, 21));
      (prisma.review.count as jest.Mock).mockResolvedValue(25);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&limit=20');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.hasMore).toBe(true);
      expect(data.pagination.nextCursor).toBe('review-19'); // Last item's ID
    });

    it('returns no cursor when no more results', async () => {
      const mockReviews = generateMockReviews(10);
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews);
      (prisma.review.count as jest.Mock).mockResolvedValue(10);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&limit=20');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.hasMore).toBe(false);
      expect(data.pagination.nextCursor).toBeNull();
    });

    it('uses cursor to fetch next page', async () => {
      const mockReviews = generateMockReviews(10, 20); // Reviews 20-29
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews);
      (prisma.review.count as jest.Mock).mockResolvedValue(30);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&cursor=review-19');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.reviews).toBeDefined();
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'review-19' },
          skip: 1, // Skip the cursor item
        })
      );
    });

    it('returns 400 for invalid cursor format', async () => {
      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&cursor=invalid<script>');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid cursor');
    });

    it('returns 400 for negative limit', async () => {
      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&limit=-5');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('limit');
    });

    it('returns 400 for non-numeric limit', async () => {
      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc&limit=abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('limit');
    });

    it('includes total count in pagination metadata', async () => {
      const mockReviews = generateMockReviews(5);
      (prisma.review.findMany as jest.Mock).mockResolvedValue(mockReviews);
      (prisma.review.count as jest.Mock).mockResolvedValue(5);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.total).toBe(5);
    });
  });

  describe('GET /api/reviews - Rate Limiting', () => {
    it('allows requests within rate limit (60/min)', async () => {
      // Under rate limit - withRateLimit returns null (allowed)
      mockWithRateLimit.mockResolvedValue(null);
      (prisma.review.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.review.count as jest.Mock).mockResolvedValue(0);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('returns 429 when rate limit exceeded', async () => {
      // Over rate limit - withRateLimit returns a 429 response
      mockWithRateLimit.mockResolvedValue({
        status: 429,
        json: async () => ({ error: 'Too many requests - rate limit exceeded' }),
        headers: new Map([['Retry-After', '60']]),
      });

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc');
      const response = await GET(request);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toContain('rate limit');
    });

    it('includes rate limit headers in response', async () => {
      // Rate limit allowed - check that headers are included in normal response
      mockWithRateLimit.mockResolvedValue(null);
      (prisma.review.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.review.count as jest.Mock).mockResolvedValue(0);

      const request = createMockRequest('http://localhost:3000/api/reviews?listingId=listing-abc');
      const response = await GET(request);

      expect(response.headers.get('X-RateLimit-Limit')).toBe('60');
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
    });
  });

  describe('POST /api/reviews - Max Length Validation', () => {
    beforeEach(() => {
      (auth as jest.Mock).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com', emailVerified: new Date() },
      });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
        id: 'booking-1',
        tenantId: 'user-123',
        listingId: 'listing-abc',
        status: 'ACCEPTED',
      });
    });

    it('accepts comment within 5000 character limit', async () => {
      const validComment = 'A'.repeat(5000);
      (prisma.review.create as jest.Mock).mockResolvedValue({
        id: 'review-new',
        authorId: 'user-123',
        listingId: 'listing-abc',
        rating: 5,
        comment: validComment,
        createdAt: new Date(),
      });

      const request = createMockRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: 'listing-abc',
          rating: 5,
          comment: validComment,
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
    });

    it('rejects comment exceeding 5000 character limit', async () => {
      const tooLongComment = 'A'.repeat(5001);

      const request = createMockRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: 'listing-abc',
          rating: 5,
          comment: tooLongComment,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      // P2-2: Zod validation returns structured error with details
      expect(data.error).toBe('Invalid request');
      expect(data.details.comment).toBeDefined();
    });

    it('rejects empty comment', async () => {
      const request = createMockRequest('http://localhost:3000/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: 'listing-abc',
          rating: 5,
          comment: '',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeDefined();
    });
  });
});
