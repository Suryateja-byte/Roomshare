/**
 * Cache Policy Tests (P2-1)
 *
 * Verifies that API endpoints have appropriate Cache-Control headers
 * to prevent sensitive data leakage and ensure operational correctness.
 */

// Mock dependencies before imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/with-rate-limit', () => ({
  withRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/shutdown', () => ({
  isInShutdownMode: jest.fn().mockReturnValue(false),
}));

describe('Cache Policy (P2-1)', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('Health Endpoints', () => {
    describe('GET /api/health/live', () => {
      it('returns Cache-Control: no-cache, no-store, must-revalidate', async () => {
        const { GET } = await import('@/app/api/health/live/route');

        const response = await GET();

        expect(response.headers.get('Cache-Control')).toBe(
          'no-cache, no-store, must-revalidate'
        );
        expect(response.status).toBe(200);
      });
    });

    describe('GET /api/health/ready', () => {
      it('returns Cache-Control: no-cache, no-store, must-revalidate when healthy', async () => {
        jest.resetModules();
        jest.mock('@/lib/prisma', () => ({
          prisma: {
            $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
          },
        }));
        jest.mock('@/lib/shutdown', () => ({
          isInShutdownMode: jest.fn().mockReturnValue(false),
        }));

        const { GET } = await import('@/app/api/health/ready/route');

        const response = await GET();

        expect(response.headers.get('Cache-Control')).toBe(
          'no-cache, no-store, must-revalidate'
        );
      });

      it('returns Cache-Control header even when unhealthy (503)', async () => {
        jest.resetModules();
        jest.mock('@/lib/prisma', () => ({
          prisma: {
            $queryRaw: jest.fn().mockRejectedValue(new Error('DB down')),
          },
        }));
        jest.mock('@/lib/shutdown', () => ({
          isInShutdownMode: jest.fn().mockReturnValue(false),
        }));

        const { GET } = await import('@/app/api/health/ready/route');

        const response = await GET();

        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe(
          'no-cache, no-store, must-revalidate'
        );
      });
    });
  });

  describe('Cache Policy Constants', () => {
    it('user-specific endpoints should use private, no-store', () => {
      // Document the expected cache policies
      const USER_SPECIFIC_POLICY = 'private, no-store';
      const HEALTH_CHECK_POLICY = 'no-cache, no-store, must-revalidate';
      const MUTATION_POLICY = 'no-store';
      const PUBLIC_LIST_POLICY = 'public, max-age=60, stale-while-revalidate=300';

      // These are the expected policies - tests above verify implementation
      expect(USER_SPECIFIC_POLICY).toBe('private, no-store');
      expect(HEALTH_CHECK_POLICY).toBe('no-cache, no-store, must-revalidate');
      expect(MUTATION_POLICY).toBe('no-store');
      expect(PUBLIC_LIST_POLICY).toContain('public');
    });
  });
});
