import * as Sentry from '@sentry/nextjs';
import { logger, sanitizeErrorMessage } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { getRequestId } from '@/lib/request-context';

/**
 * Shared API error handler that captures to Sentry and logs structured error.
 * Use in catch blocks of all API route handlers.
 */
export function captureApiError(
  error: unknown,
  context: { route: string; method: string; userId?: string }
): NextResponse {
  const message = sanitizeErrorMessage(error);

  logger.sync.error(`API error in ${context.route}`, {
    error: message,
    method: context.method,
    userId: context.userId,
    requestId: getRequestId(),
  });

  Sentry.captureException(error, {
    tags: {
      route: context.route,
      method: context.method,
    },
    extra: {
      requestId: getRequestId(),
    },
  });

  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  );
}

/**
 * Return a generic error response with a given status code.
 * Use when you want to capture the error separately or need a non-500 status.
 */
export function apiErrorResponse(status = 500) {
  return NextResponse.json({ error: 'Internal server error' }, { status });
}
