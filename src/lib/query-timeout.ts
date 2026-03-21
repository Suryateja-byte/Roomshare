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
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SET LOCAL statement_timeout = ${timeoutMs}`
    );
    return tx.$queryRawUnsafe<T[]>(query, ...params);
  });
}
