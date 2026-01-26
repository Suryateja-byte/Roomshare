/**
 * Next.js Middleware for request-level checks.
 *
 * P0-01 FIX: Enforce suspension on protected routes.
 *
 * This middleware runs before route handlers and checks:
 * 1. If user is suspended, block access to protected routes
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkSuspension } from '@/lib/auth-helpers';

export async function middleware(request: NextRequest) {
  // Check suspension status for protected routes
  const suspensionResponse = await checkSuspension(request);
  if (suspensionResponse) {
    return suspensionResponse;
  }

  // Continue to route handler
  return NextResponse.next();
}

/**
 * Configure which routes the middleware runs on.
 * We run on API routes and protected pages.
 */
export const config = {
  matcher: [
    // API routes (excluding auth)
    '/api/((?!auth).*)',
    // Protected pages
    '/dashboard/:path*',
    '/listings/new',
  ],
};
