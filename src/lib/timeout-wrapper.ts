/**
 * P0-05/P1-08/P1-09/P1-10 FIX: Timeout wrapper utility
 * Provides timeout protection for async operations to prevent indefinite hangs.
 */

/**
 * Custom error for timeout failures
 */
export class TimeoutError extends Error {
  public readonly code = 'TIMEOUT_ERROR';
  public readonly operation: string;
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Type guard to check if an error is a TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError;
}

/**
 * Wraps a promise with a timeout, rejecting if the operation takes too long.
 *
 * @param promise - The promise to wrap with a timeout
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param operation - Human-readable operation name for error messages
 * @returns The resolved value of the promise, or rejects with TimeoutError
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = await withTimeout(
 *   fetch('https://api.example.com/data'),
 *   5000,
 *   'API fetch'
 * );
 *
 * // With error handling
 * try {
 *   const data = await withTimeout(someAsyncOp(), 3000, 'data processing');
 * } catch (error) {
 *   if (isTimeoutError(error)) {
 *     console.log(`Operation ${error.operation} timed out`);
 *   }
 * }
 * ```
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Wraps a fetch call with a timeout using AbortController.
 * This properly cancels the underlying request on timeout.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (RequestInit)
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param operation - Human-readable operation name for error messages
 * @returns The fetch Response
 *
 * @example
 * ```typescript
 * const response = await fetchWithTimeout(
 *   'https://api.radar.io/v1/search',
 *   { headers: { Authorization: 'token' } },
 *   5000,
 *   'Radar API search'
 * );
 * ```
 */
export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit = {},
  timeoutMs: number,
  operation: string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    // Convert AbortError to TimeoutError for consistent error handling
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(operation, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Default timeout values for different operation types (in milliseconds)
 */
export const DEFAULT_TIMEOUTS = {
  /** LLM streaming operations - longer timeout for AI responses */
  LLM_STREAM: 30000,
  /** Redis operations - should be fast */
  REDIS: 1000,
  /** External API calls like Radar */
  EXTERNAL_API: 5000,
  /** Database queries */
  DATABASE: 10000,
  /** Email sending */
  EMAIL: 15000,
} as const;
