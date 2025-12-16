/**
 * Request context management using AsyncLocalStorage
 * Provides request-scoped context (request ID, user ID) for logging and tracing
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export interface RequestContext {
  requestId: string;
  userId?: string;
  startTime: number;
  path?: string;
  method?: string;
}

// AsyncLocalStorage instance for request-scoped context
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a unique request ID
 * Uses x-request-id header if present, otherwise generates a UUID
 */
export function generateRequestId(existingId?: string): string {
  return existingId || randomUUID();
}

/**
 * Run a function within a request context
 * All code within the callback will have access to the context via getRequestContext()
 *
 * @example
 * ```ts
 * await runWithRequestContext({ requestId: 'abc-123', userId: 'user-456' }, async () => {
 *   // All logs and traces within this function will include the context
 *   logger.info('Processing request');
 * });
 * ```
 */
export function runWithRequestContext<T>(
  context: Partial<RequestContext>,
  fn: () => T
): T {
  const fullContext: RequestContext = {
    requestId: context.requestId || generateRequestId(),
    userId: context.userId,
    startTime: context.startTime || Date.now(),
    path: context.path,
    method: context.method,
  };

  return requestContextStorage.run(fullContext, fn);
}

/**
 * Get the current request context
 * Returns undefined if called outside of a request context
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Update the current request context
 * Useful for adding user ID after authentication
 */
export function updateRequestContext(updates: Partial<RequestContext>): void {
  const current = requestContextStorage.getStore();
  if (current) {
    Object.assign(current, updates);
  }
}

/**
 * Get the current request ID
 * Returns 'unknown' if called outside of a request context
 */
export function getRequestId(): string {
  return getRequestContext()?.requestId || 'unknown';
}

/**
 * Get the elapsed time since request start in milliseconds
 */
export function getRequestDuration(): number {
  const context = getRequestContext();
  return context ? Date.now() - context.startTime : 0;
}

/**
 * Create request context from Next.js request headers
 */
export function createContextFromHeaders(headers: Headers): Partial<RequestContext> {
  return {
    requestId: headers.get('x-request-id') || headers.get('x-vercel-id') || generateRequestId(),
    startTime: Date.now(),
  };
}
