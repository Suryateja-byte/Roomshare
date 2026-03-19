/**
 * CSRF protection for API routes.
 *
 * Next.js Server Actions have built-in CSRF protection (Origin header check),
 * but API routes (POST/PUT/PATCH/DELETE) do NOT.  This module provides
 * Origin-based CSRF validation for all state-changing API routes.
 *
 * Design:
 *   - Require the Origin header on every mutation request.
 *   - Verify that Origin matches the request's Host header.
 *   - In development, also allow localhost origins.
 *   - GET/HEAD/OPTIONS are excluded (safe methods).
 */

import "server-only";
import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Validate that the request Origin matches the expected host.
 *
 * @returns null if valid, or a 403 NextResponse if invalid.
 */
export function validateCsrf(request: Request): NextResponse | null {
  // Skip CSRF in test environment — no browser context
  if (process.env.NODE_ENV === "test") {
    return null;
  }

  const method = request.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (SAFE_METHODS.has(method)) {
    return null;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  // Origin header is REQUIRED on mutation requests
  if (!origin) {
    return NextResponse.json(
      { error: "Forbidden: missing Origin header" },
      { status: 403 }
    );
  }

  // Extract host from Origin URL
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json(
      { error: "Forbidden: malformed Origin header" },
      { status: 403 }
    );
  }

  // In development, allow localhost variants
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    const localhostPatterns = [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
    ];
    const isLocalhostOrigin = localhostPatterns.some(
      (p) => originHost.startsWith(p)
    );
    const isLocalhostHost = host
      ? localhostPatterns.some((p) => host.startsWith(p))
      : false;
    if (isLocalhostOrigin && isLocalhostHost) {
      return null;
    }
  }

  // Strict match: Origin host must equal Host header
  if (!host || originHost !== host) {
    return NextResponse.json(
      { error: "Forbidden: Origin mismatch" },
      { status: 403 }
    );
  }

  return null;
}
