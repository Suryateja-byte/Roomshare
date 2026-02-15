/**
 * Authentication helper functions
 * Pure functions for auth validation, easily testable
 */

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';

// Re-export from standalone module for backward compatibility (auth.ts imports from here)
export { normalizeEmail } from './normalize-email';

/**
 * Public routes that don't require authentication or suspension check.
 * Suspended users can still access these routes.
 */
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/listings',
  '/search',
  '/api/auth',
  '/_next',
  '/favicon.ico',
];

/**
 * Protected API paths that require suspension check.
 * Write operations on these paths are blocked for suspended users.
 */
const PROTECTED_API_PATHS = [
  '/api/listings',
  '/api/bookings',
  '/api/messages',
  '/api/reviews',
];

/**
 * Protected page paths that require suspension check.
 */
const PROTECTED_PAGE_PATHS = [
  '/dashboard',
  '/listings/new',
];

/**
 * Read-only public API endpoints.
 * GET requests to these endpoints are allowed for suspended users.
 */
const READ_ONLY_PUBLIC_ENDPOINTS = [
  '/api/listings',
];

/**
 * Check if a pathname is a public route that doesn't need suspension check.
 * Public routes are accessible to everyone, including suspended users.
 *
 * Note: Protected paths take precedence, so /listings/new is protected
 * even though /listings is public.
 */
export function isPublicRoute(pathname: string): boolean {
  // Protected paths take precedence over public paths
  // e.g., /listings/new is protected even though /listings is public
  const isProtected = PROTECTED_PAGE_PATHS.some(path => {
    return pathname === path || pathname.startsWith(`${path}/`);
  });
  if (isProtected) return false;

  return PUBLIC_PATHS.some(path => {
    // Exact match for root
    if (path === '/') return pathname === '/';
    // Prefix match for other paths
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}

/**
 * Check if an endpoint is read-only and publicly accessible.
 * Suspended users can still read public data via GET requests.
 */
export function isReadOnlyPublicEndpoint(pathname: string, method: string): boolean {
  if (method !== 'GET') return false;

  return READ_ONLY_PUBLIC_ENDPOINTS.some(path => {
    return pathname === path || pathname.startsWith(`${path}/`);
  });
}

/**
 * Check if a pathname is a protected route that needs suspension check.
 */
function isProtectedRoute(pathname: string): boolean {
  // Check protected API paths
  const isProtectedApi = PROTECTED_API_PATHS.some(path => {
    return pathname === path || pathname.startsWith(`${path}/`);
  });

  // Check protected page paths
  const isProtectedPage = PROTECTED_PAGE_PATHS.some(path => {
    return pathname === path || pathname.startsWith(`${path}/`);
  });

  return isProtectedApi || isProtectedPage;
}

function buildSuspensionBlockedResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Account suspended',
      code: 'ACCOUNT_SUSPENDED',
    },
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Check current suspension status directly from the database.
 * This reduces token staleness for recently suspended users.
 *
 * SECURITY FIX (P1): Previously used HTTP fetch to an internal API endpoint,
 * constructing the URL from request.nextUrl.origin (attacker-controlled via
 * Host header) and sending NEXTAUTH_SECRET in a custom header. Replaced with
 * direct Prisma query to eliminate the secret exfiltration attack surface.
 *
 * @returns true if suspended, false if not, undefined on error (graceful degradation)
 */
async function getLiveSuspensionStatus(
  userId: string
): Promise<boolean | undefined> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuspended: true },
    });

    return user?.isSuspended === true;
  } catch {
    return undefined;
  }
}

/**
 * Check if a suspended user should be blocked from accessing a route.
 *
 * P0-01 FIX: Enforce suspension on protected routes.
 *
 * @returns NextResponse with 403 if blocked, null if allowed to proceed
 */
export async function checkSuspension(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // Public routes are always accessible
  if (isPublicRoute(pathname)) {
    return null;
  }

  // Get token to check suspension status
  // Pass secret explicitly — Edge Runtime may not see process.env reliably
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  const token = await getToken({ req: request, secret });

  // No token means unauthenticated - let the route handler deal with it
  if (!token) {
    return null;
  }

  // Only enforce suspension rules on protected routes
  if (!isProtectedRoute(pathname)) {
    return null;
  }

  // Allow read-only access to public endpoints for suspended users
  if (isReadOnlyPublicEndpoint(pathname, method)) {
    return null;
  }

  // Fast path: token already marked suspended
  if (token.isSuspended === true) {
    return buildSuspensionBlockedResponse();
  }

  // Live check: catch newly suspended users before token refresh.
  const userId = typeof token.sub === 'string' ? token.sub : undefined;
  if (!userId) {
    return null;
  }

  const liveSuspended = await getLiveSuspensionStatus(userId);
  if (liveSuspended) {
    return buildSuspensionBlockedResponse();
  }

  return null;
}

/**
 * Validates Google OAuth profile has verified email.
 * Returns true only if email_verified === true (not truthy).
 *
 * SECURITY: This is a hard-fail check - we reject any profile where
 * email_verified is not exactly true (false, undefined, or truthy non-boolean).
 */
export function isGoogleEmailVerified(
    profile: { email_verified?: boolean } | undefined
): boolean {
    return profile?.email_verified === true;
}

/** Auth route paths - must match auth.ts pages config */
export const AUTH_ROUTES = {
    signIn: '/login',
} as const;
