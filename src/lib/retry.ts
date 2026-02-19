/**
 * Simple retry utility with exponential backoff for cron job DB operations.
 * Retries on transient failures (connection resets, timeouts, deadlocks).
 */

import { logger } from '@/lib/logger';

const TRANSIENT_ERROR_CODES = new Set([
  'P2024', // Prisma: Timed out fetching a new connection
  'P2028', // Prisma: Transaction API error (deadlock/timeout)
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
]);

function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
    if (error.message.includes('deadlock')) return true;
    if (error.message.includes('connection') && error.message.includes('timeout')) return true;
  }
  return false;
}

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  context?: string;
}

/**
 * Retry an async operation with exponential backoff.
 * Only retries on transient errors (connection issues, deadlocks, timeouts).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500, context = 'operation' } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === maxAttempts;
      const isTransient = isTransientError(error);

      if (isLast || !isTransient) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.sync.warn(`[Retry] ${context} attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt,
        maxAttempts,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error(`${context}: exhausted all ${maxAttempts} retry attempts`);
}
