/**
 * Tests for auth-helpers.ts
 *
 * Covers: isPublicRoute, isReadOnlyPublicEndpoint, isGoogleEmailVerified,
 * checkSuspension (middleware), AUTH_ROUTES, and route matching edge cases.
 */

jest.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status || 200,
      json: async () => data,
      headers: new Map(Object.entries(init?.headers || {})),
    }),
  },
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import {
  isPublicRoute,
  isReadOnlyPublicEndpoint,
  isGoogleEmailVerified,
  checkSuspension,
  AUTH_ROUTES,
} from '@/lib/auth-helpers';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

// Helper to create a minimal mock NextRequest
function createMockRequest(pathname: string, method = 'GET') {
  return { nextUrl: { pathname }, method } as any;
}

// ── isPublicRoute ──

describe('isPublicRoute', () => {
  it('returns true for root path /', () => {
    expect(isPublicRoute('/')).toBe(true);
  });

  it('returns false for non-root paths that start with /', () => {
    expect(isPublicRoute('/random')).toBe(false);
  });

  it.each(['/login', '/signup', '/listings', '/search', '/api/auth', '/_next', '/favicon.ico'])(
    'returns true for public path %s',
    (path) => {
      expect(isPublicRoute(path)).toBe(true);
    },
  );

  it.each([
    ['/login/callback', true],
    ['/signup/verify', true],
    ['/listings/123', true],
    ['/search/results', true],
    ['/api/auth/callback/google', true],
    ['/_next/static/chunk.js', true],
  ])('returns %s for subpath %s of a public route', (path, expected) => {
    expect(isPublicRoute(path as string)).toBe(expected);
  });

  it('returns false for /dashboard (protected page path)', () => {
    expect(isPublicRoute('/dashboard')).toBe(false);
  });

  it('returns false for /dashboard/settings', () => {
    expect(isPublicRoute('/dashboard/settings')).toBe(false);
  });

  it('returns false for /listings/create (protected takes precedence over /listings)', () => {
    expect(isPublicRoute('/listings/create')).toBe(false);
  });

  it('returns false for /listings/create/step2 (protected subpath)', () => {
    expect(isPublicRoute('/listings/create/step2')).toBe(false);
  });

  it('returns false for API paths not in public list', () => {
    expect(isPublicRoute('/api/bookings')).toBe(false);
    expect(isPublicRoute('/api/messages')).toBe(false);
    expect(isPublicRoute('/api/reviews')).toBe(false);
  });

  it('returns false for unknown paths', () => {
    expect(isPublicRoute('/admin')).toBe(false);
    expect(isPublicRoute('/profile')).toBe(false);
    expect(isPublicRoute('/settings')).toBe(false);
  });
});

// ── isReadOnlyPublicEndpoint ──

describe('isReadOnlyPublicEndpoint', () => {
  it('returns true for GET /api/listings', () => {
    expect(isReadOnlyPublicEndpoint('/api/listings', 'GET')).toBe(true);
  });

  it('returns true for GET /api/listings/123 (subpath)', () => {
    expect(isReadOnlyPublicEndpoint('/api/listings/123', 'GET')).toBe(true);
  });

  it('returns true for GET /api/listings/123/status (deeper subpath)', () => {
    expect(isReadOnlyPublicEndpoint('/api/listings/123/status', 'GET')).toBe(true);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'returns false for %s /api/listings (write methods)',
    (method) => {
      expect(isReadOnlyPublicEndpoint('/api/listings', method)).toBe(false);
    },
  );

  it.each(['/api/bookings', '/api/messages', '/api/reviews', '/api/users'])(
    'returns false for GET on non-listing endpoint %s',
    (path) => {
      expect(isReadOnlyPublicEndpoint(path, 'GET')).toBe(false);
    },
  );
});

// ── isGoogleEmailVerified ──

describe('isGoogleEmailVerified', () => {
  it('returns true when email_verified is exactly true', () => {
    expect(isGoogleEmailVerified({ email_verified: true })).toBe(true);
  });

  it('returns false when email_verified is false', () => {
    expect(isGoogleEmailVerified({ email_verified: false })).toBe(false);
  });

  it('returns false when email_verified is undefined', () => {
    expect(isGoogleEmailVerified({ email_verified: undefined })).toBe(false);
    expect(isGoogleEmailVerified({})).toBe(false);
  });

  it('returns false when profile is undefined', () => {
    expect(isGoogleEmailVerified(undefined)).toBe(false);
  });

  it('returns false for truthy but non-boolean values', () => {
    expect(isGoogleEmailVerified({ email_verified: 1 } as any)).toBe(false);
    expect(isGoogleEmailVerified({ email_verified: 'true' } as any)).toBe(false);
  });

  it('returns false when email_verified is null', () => {
    expect(isGoogleEmailVerified({ email_verified: null } as any)).toBe(false);
  });
});

// ── AUTH_ROUTES ──

describe('AUTH_ROUTES', () => {
  it('has signIn route defined as /login', () => {
    expect(AUTH_ROUTES.signIn).toBe('/login');
  });

  it('signIn route starts with /', () => {
    expect(AUTH_ROUTES.signIn).toMatch(/^\//);
  });
});

// ── checkSuspension (middleware) ──

describe('checkSuspension', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, AUTH_SECRET: 'test-secret' } as any;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // --- Public route bypass ---

  it('returns null for public routes without checking token', async () => {
    const result = await checkSuspension(createMockRequest('/login'));
    expect(result).toBeNull();
    expect(getToken).not.toHaveBeenCalled();
  });

  it('returns null for / (root public route)', async () => {
    const result = await checkSuspension(createMockRequest('/'));
    expect(result).toBeNull();
  });

  it('returns null for /api/auth routes', async () => {
    const result = await checkSuspension(createMockRequest('/api/auth/callback'));
    expect(result).toBeNull();
  });

  // --- No token (unauthenticated) ---

  it('returns null when no token exists', async () => {
    (getToken as jest.Mock).mockResolvedValue(null);
    const result = await checkSuspension(createMockRequest('/dashboard'));
    expect(result).toBeNull();
  });

  // --- Non-protected route with token ---

  it('returns null for non-protected route with valid token', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: false });
    const result = await checkSuspension(createMockRequest('/some-unknown-page'));
    expect(result).toBeNull();
  });

  // --- Read-only public endpoint bypass ---

  it('allows GET /api/listings for suspended users (read-only bypass)', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: true });
    const result = await checkSuspension(createMockRequest('/api/listings', 'GET'));
    expect(result).toBeNull();
  });

  it('allows GET /api/listings/123 for suspended users', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: true });
    const result = await checkSuspension(createMockRequest('/api/listings/123', 'GET'));
    expect(result).toBeNull();
  });

  // --- Suspended user blocked ---

  it('returns 403 when token.isSuspended is true on protected route', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: true });
    const result = await checkSuspension(createMockRequest('/api/bookings', 'POST'));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
    const data = await result!.json();
    expect(data.error).toBe('Account suspended');
    expect(data.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('returns 403 for suspended user on /dashboard', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: true });
    const result = await checkSuspension(createMockRequest('/dashboard'));

    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('blocks POST /api/listings for suspended users', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: true });
    const result = await checkSuspension(createMockRequest('/api/listings', 'POST'));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it.each(['/api/listings', '/api/bookings', '/api/messages', '/api/reviews'])(
    'blocks POST to protected API path %s for suspended users',
    async (path) => {
      (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: true });
      const result = await checkSuspension(createMockRequest(path, 'POST'));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    },
  );

  it.each(['/dashboard', '/listings/create'])(
    'blocks access to protected page %s for suspended users',
    async (path) => {
      (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: true });
      const result = await checkSuspension(createMockRequest(path));
      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    },
  );

  // --- Live DB check ---

  it('returns 403 when live DB check reveals newly suspended user', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: false });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isSuspended: true });

    const result = await checkSuspension(createMockRequest('/api/messages', 'POST'));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it('returns null when live DB check confirms non-suspended user', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: false });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isSuspended: false });

    const result = await checkSuspension(createMockRequest('/dashboard'));
    expect(result).toBeNull();
  });

  it('queries DB with correct userId from token.sub', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-789', isSuspended: false });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ isSuspended: false });

    await checkSuspension(createMockRequest('/dashboard'));

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-789' },
      select: { isSuspended: true },
    });
  });

  // --- Edge cases ---

  it('returns null when token has no sub (userId)', async () => {
    (getToken as jest.Mock).mockResolvedValue({ isSuspended: false });
    const result = await checkSuspension(createMockRequest('/api/bookings', 'POST'));
    expect(result).toBeNull();
  });

  it('returns null when token.sub is not a string', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 123, isSuspended: false });
    const result = await checkSuspension(createMockRequest('/api/bookings', 'POST'));
    expect(result).toBeNull();
  });

  it('returns null on DB error (graceful degradation)', async () => {
    (getToken as jest.Mock).mockResolvedValue({ sub: 'user-123', isSuspended: false });
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

    const result = await checkSuspension(createMockRequest('/api/bookings', 'POST'));
    expect(result).toBeNull();
  });

  it('passes AUTH_SECRET to getToken', async () => {
    (getToken as jest.Mock).mockResolvedValue(null);
    const request = createMockRequest('/dashboard');

    await checkSuspension(request);

    expect(getToken).toHaveBeenCalledWith({
      req: request,
      secret: 'test-secret',
    });
  });

  it('falls back to NEXTAUTH_SECRET when AUTH_SECRET is not set', async () => {
    delete process.env.AUTH_SECRET;
    process.env = { ...process.env, NEXTAUTH_SECRET: 'fallback-secret' } as any;
    (getToken as jest.Mock).mockResolvedValue(null);
    const request = createMockRequest('/dashboard');

    await checkSuspension(request);

    expect(getToken).toHaveBeenCalledWith({
      req: request,
      secret: 'fallback-secret',
    });
  });
});
