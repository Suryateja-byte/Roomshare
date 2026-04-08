import "server-only";

import { prisma } from "@/lib/prisma";

const DEFAULT_QUERY_TIMEOUT_MS = 5000;

/**
 * Execute a raw SQL query with a statement timeout.
 * Wraps the query in a transaction with SET LOCAL statement_timeout.
 * If the query exceeds the timeout, PostgreSQL cancels it automatically.
 *
 * SECURITY INVARIANT: `query` must contain ONLY hard-coded SQL template strings.
 * ALL user-supplied values MUST be in the `params` array as $N placeholders.
 */
export async function queryWithTimeout<T>(
  query: string,
  params: unknown[],
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS
): Promise<T[]> {
  // MED-5 FIX: Validate timeoutMs before interpolation into SQL.
  // PostgreSQL SET LOCAL doesn't support $N params, so we must interpolate,
  // but we enforce that the value is a safe positive integer first.
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) {
    throw new Error(
      `Invalid query timeout: ${timeoutMs}. Must be a positive integer <= 30000.`
    );
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${timeoutMs}`);
    return tx.$queryRawUnsafe<T[]>(query, ...params);
  });
}
