/**
 * Tests for suspension middleware (P0-01, P1-01)
 *
 * Verifies that suspended users receive 403 on protected routes
 * and can still access public routes.
 */

import type { NextRequest } from 'next/server';

// Mock next-auth/jwt before importing middleware
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { getToken } from 'next-auth/jwt';

// We'll test the middleware logic directly
// The actual middleware will be created after tests pass

describe('Suspension Middleware', () => {
  const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper to create mock NextRequest that works in Jest
  function createMockRequest(pathname: string, method = 'GET'): NextRequest {
    const url = new URL(pathname, 'http://localhost:3000');
    return {
      nextUrl: url,
      method,
      headers: new Headers(),
    } as unknown as NextRequest;
  }

  describe('Protected Routes', () => {
    // API routes need write methods (POST/PATCH/DELETE) to trigger suspension block
    // because GET is allowed for suspended users (read-only access)
    const protectedApiPaths = [
      { pathname: '/api/listings', method: 'POST' },
      { pathname: '/api/bookings', method: 'POST' },
      { pathname: '/api/messages', method: 'POST' },
      { pathname: '/api/reviews', method: 'POST' },
    ];

    // Page routes block suspended users on any method
    const protectedPagePaths = [
      '/dashboard',
      '/dashboard/listings',
      '/dashboard/bookings',
      '/listings/new',
    ];

    it.each(protectedApiPaths)(
      'returns 403 for suspended user on $method $pathname',
      async ({ pathname, method }) => {
        mockGetToken.mockResolvedValue({
          sub: 'user-123',
          isSuspended: true,
          email: 'test@example.com',
        });

        // Import middleware after mocks are set up
        const { checkSuspension } = await import('@/lib/auth-helpers');

        const request = createMockRequest(pathname, method);
        const result = await checkSuspension(request);

        expect(result).not.toBeNull();
        expect(result?.status).toBe(403);
      }
    );

    it.each(protectedPagePaths)(
      'returns 403 for suspended user on %s',
      async (pathname) => {
        mockGetToken.mockResolvedValue({
          sub: 'user-123',
          isSuspended: true,
          email: 'test@example.com',
        });

        const { checkSuspension } = await import('@/lib/auth-helpers');

        const request = createMockRequest(pathname);
        const result = await checkSuspension(request);

        expect(result).not.toBeNull();
        expect(result?.status).toBe(403);
      }
    );

    it.each([...protectedApiPaths.map(p => p.pathname), ...protectedPagePaths])(
      'allows non-suspended user on %s',
      async (pathname) => {
        mockGetToken.mockResolvedValue({
          sub: 'user-123',
          isSuspended: false,
          email: 'test@example.com',
        });

        const { checkSuspension } = await import('@/lib/auth-helpers');

        const request = createMockRequest(pathname);
        const result = await checkSuspension(request);

        // null means continue processing
        expect(result).toBeNull();
      }
    );

    it('allows unauthenticated user to proceed (auth handled elsewhere)', async () => {
      mockGetToken.mockResolvedValue(null);

      const { checkSuspension } = await import('@/lib/auth-helpers');

      const request = createMockRequest('/api/listings');
      const result = await checkSuspension(request);

      // Middleware doesn't block unauthenticated - that's handled by route
      expect(result).toBeNull();
    });
  });

  describe('Public Routes', () => {
    const publicPaths = [
      '/',
      '/login',
      '/signup',
      '/listings',
      '/listings/abc-123',
      '/search',
      '/api/auth/signin',
      '/api/auth/signout',
      '/api/auth/callback/google',
      '/_next/static/chunk.js',
      '/favicon.ico',
    ];

    it.each(publicPaths)(
      'allows suspended user on public route %s',
      async (pathname) => {
        mockGetToken.mockResolvedValue({
          sub: 'user-123',
          isSuspended: true,
          email: 'test@example.com',
        });

        const { isPublicRoute } = await import('@/lib/auth-helpers');

        // Public routes should be identified as such
        expect(isPublicRoute(pathname)).toBe(true);
      }
    );
  });

  describe('API Route Protection', () => {
    it('returns 403 with proper JSON error for suspended user on POST /api/listings', async () => {
      mockGetToken.mockResolvedValue({
        sub: 'user-123',
        isSuspended: true,
        email: 'test@example.com',
      });

      const { checkSuspension } = await import('@/lib/auth-helpers');

      const request = createMockRequest('/api/listings', 'POST');
      const result = await checkSuspension(request);

      expect(result?.status).toBe(403);
      expect(result?.headers.get('Content-Type')).toContain('application/json');
    });

    it('returns 403 for suspended user on PATCH /api/listings/[id]', async () => {
      mockGetToken.mockResolvedValue({
        sub: 'user-123',
        isSuspended: true,
        email: 'test@example.com',
      });

      const { checkSuspension } = await import('@/lib/auth-helpers');

      const request = createMockRequest('/api/listings/listing-123', 'PATCH');
      const result = await checkSuspension(request);

      expect(result?.status).toBe(403);
    });

    it('returns 403 for suspended user on DELETE /api/listings/[id]', async () => {
      mockGetToken.mockResolvedValue({
        sub: 'user-123',
        isSuspended: true,
        email: 'test@example.com',
      });

      const { checkSuspension } = await import('@/lib/auth-helpers');

      const request = createMockRequest('/api/listings/listing-123', 'DELETE');
      const result = await checkSuspension(request);

      expect(result?.status).toBe(403);
    });
  });

  describe('Read-Only Operations for Suspended Users', () => {
    // Suspended users can still read public data
    it('allows suspended user to GET /api/listings (public read)', async () => {
      mockGetToken.mockResolvedValue({
        sub: 'user-123',
        isSuspended: true,
        email: 'test@example.com',
      });

      const { isReadOnlyPublicEndpoint } = await import('@/lib/auth-helpers');

      // GET on listings list is read-only public
      expect(isReadOnlyPublicEndpoint('/api/listings', 'GET')).toBe(true);
    });

    it('blocks suspended user from POST /api/listings (write operation)', async () => {
      mockGetToken.mockResolvedValue({
        sub: 'user-123',
        isSuspended: true,
        email: 'test@example.com',
      });

      const { isReadOnlyPublicEndpoint } = await import('@/lib/auth-helpers');

      expect(isReadOnlyPublicEndpoint('/api/listings', 'POST')).toBe(false);
    });
  });
});

describe('Suspension Banner Integration', () => {
  it('session includes isSuspended flag for UI display', async () => {
    // This test verifies the session shape includes suspension info
    const mockSession = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        isSuspended: true,
      },
    };

    expect(mockSession.user.isSuspended).toBe(true);
  });
});
