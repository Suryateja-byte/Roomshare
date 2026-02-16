/**
 * Idempotency wrapper for database operations.
 *
 * P0 Correctness Guarantees:
 * 1. ENTIRE flow runs inside ONE SERIALIZABLE transaction
 * 2. Key uniqueness scoped to (userId, endpoint, key)
 * 3. INSERT ON CONFLICT + FOR UPDATE = atomic claim with no race window
 * 4. requestHash check happens BEFORE returning cached results
 * 5. Deterministic hash via sorted key stringify
 *
 * Status model (simplified - 'failed' removed as it can never persist):
 * - 'processing': Transaction in flight
 * - 'completed': Successfully finished, result cached
 *
 * If transaction fails, it rolls back entirely (including the INSERT),
 * so the client can retry with the same key.
 */

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Prisma transaction client type
type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

export interface IdempotencySuccess<T> {
  success: true;
  result: T;
  cached: boolean;
}

export interface IdempotencyError {
  success: false;
  error: string;
  status: number;
}

export type IdempotencyResult<T> = IdempotencySuccess<T> | IdempotencyError;

/**
 * Deterministic JSON stringify with sorted keys.
 * Ensures {a:1, b:2} and {b:2, a:1} produce the same string.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return String(obj);
  }

  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

  // Sort keys for deterministic output
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ":" + stableStringify(value);
  });

  return "{" + pairs.join(",") + "}";
}

/**
 * Compute SHA-256 hash of request body using deterministic stringify.
 */
function computeRequestHash(requestBody: unknown): string {
  return crypto
    .createHash("sha256")
    .update(stableStringify(requestBody))
    .digest("hex");
}

/**
 * Wraps an operation with idempotency guarantees.
 *
 * @param key - Client-provided idempotency key (unique per user+endpoint)
 * @param userId - User making the request
 * @param endpoint - Logical operation name (e.g., 'createBooking')
 * @param requestBody - Request payload (hashed for verification)
 * @param operation - The database operation to execute idempotently
 *
 * @returns IdempotencySuccess with result, or IdempotencyError
 *
 * Error codes:
 * - 400: Key reused with different request body
 * - 409: Request already in progress (concurrent duplicate)
 * - 500: Internal error (should not happen)
 */
// Maximum retries for SERIALIZABLE serialization failures (SQLSTATE 40001)
const MAX_SERIALIZATION_RETRIES = 3;

/**
 * Check if error is a serialization failure (SQLSTATE 40001 / Prisma P2034)
 */
function isSerializationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return err.code === "P2034" || err.message?.includes("40001") || false;
}

export async function withIdempotency<T>(
  key: string,
  userId: string,
  endpoint: string,
  requestBody: unknown,
  operation: (tx: TransactionClient) => Promise<T>,
): Promise<IdempotencyResult<T>> {
  const requestHash = computeRequestHash(requestBody);

  // Retry loop for SERIALIZABLE serialization conflicts
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      // ENTIRE flow runs in ONE transaction - lock held until commit
      return await prisma.$transaction(
        async (tx) => {
          // ─────────────────────────────────────────────────────────────
          // Step 1: Atomic claim via INSERT ON CONFLICT DO NOTHING
          // ─────────────────────────────────────────────────────────────
          // If row exists, this is a no-op (no error, no update)
          // If row doesn't exist, we claim it with status='processing'
          await tx.$executeRaw`
        INSERT INTO "IdempotencyKey" (
          id, key, "userId", endpoint, status, "requestHash", "createdAt", "expiresAt"
        )
        VALUES (
          gen_random_uuid()::text,
          ${key},
          ${userId},
          ${endpoint},
          'processing',
          ${requestHash},
          NOW(),
          NOW() + INTERVAL '24 hours'
        )
        ON CONFLICT ("userId", endpoint, key) DO NOTHING
      `;

          // ─────────────────────────────────────────────────────────────
          // Step 2: Lock and fetch the row
          // ─────────────────────────────────────────────────────────────
          // Row MUST exist (either we just inserted, or it existed before)
          // FOR UPDATE blocks concurrent requests until we commit/rollback
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              status: string;
              requestHash: string;
              resultData: unknown;
            }>
          >`
        SELECT id, status, "requestHash", "resultData"
        FROM "IdempotencyKey"
        WHERE "userId" = ${userId}
          AND endpoint = ${endpoint}
          AND key = ${key}
        FOR UPDATE
      `;

          const row = rows[0];

          // Defensive: should never happen
          if (!row) {
            return {
              success: false,
              error: "Failed to acquire idempotency lock",
              status: 500,
            };
          }

          // ─────────────────────────────────────────────────────────────
          // Step 3: Hash verification FIRST (before any returns)
          // ─────────────────────────────────────────────────────────────
          // This MUST happen before returning cached results to prevent
          // key reuse attacks where attacker replays with different payload
          if (row.requestHash !== requestHash) {
            // Exception: allow legacy placeholder from migration
            if (row.requestHash !== "legacy-migration-placeholder") {
              return {
                success: false,
                error: "Idempotency key reused with different request body",
                status: 400,
              };
            }
            // Legacy row - allow this request to proceed
            // The hash will be updated when we complete
          }

          // ─────────────────────────────────────────────────────────────
          // Step 4: If completed → return cached response
          // ─────────────────────────────────────────────────────────────
          if (row.status === "completed") {
            return {
              success: true,
              result: row.resultData as T,
              cached: true,
            };
          }

          // ─────────────────────────────────────────────────────────────
          // Step 5: Execute the operation
          // ─────────────────────────────────────────────────────────────
          // All DB writes happen in the same transaction as the idempotency lock.
          // If operation throws, entire transaction rolls back (including our INSERT).
          const result = await operation(tx);

          // ─────────────────────────────────────────────────────────────
          // Step 6: Mark as completed with cached result
          // ─────────────────────────────────────────────────────────────
          // Update hash in case this was a legacy migration entry
          await tx.$executeRaw`
        UPDATE "IdempotencyKey"
        SET status = 'completed',
            "requestHash" = ${requestHash},
            "resultData" = ${JSON.stringify(result)}::jsonb
        WHERE id = ${row.id}
      `;

          return {
            success: true,
            result,
            cached: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000, // 30s timeout for complex operations
        },
      );
    } catch (error) {
      // Retry on serialization failure with exponential backoff
      if (isSerializationError(error)) {
        if (attempt === MAX_SERIALIZATION_RETRIES) {
          logger.sync.error(
            `[Idempotency] Serialization failed after ${MAX_SERIALIZATION_RETRIES} attempts`,
            {
              key,
              userId,
              endpoint,
            },
          );
          throw error;
        }
        // Exponential backoff: 100ms, 200ms, 400ms
        const backoffMs = 50 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      // Non-serialization errors are not retryable
      throw error;
    }
  }

  // TypeScript: unreachable but required for type safety
  throw new Error("Idempotency retry loop exhausted unexpectedly");
}

/**
 * Helper to create HTTP response from idempotency result.
 */
export function idempotencyResponse<T>(result: IdempotencyResult<T>): {
  body: unknown;
  status: number;
  headers?: Record<string, string>;
} {
  if (!result.success) {
    return {
      body: { error: result.error },
      status: result.status,
    };
  }

  return {
    body: {
      success: true,
      data: result.result,
      cached: result.cached,
    },
    status: 200,
    headers: result.cached ? { "X-Idempotency-Replayed": "true" } : undefined,
  };
}
