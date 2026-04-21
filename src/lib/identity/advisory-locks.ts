import type { TransactionClient } from "@/lib/db/with-actor";
import { AdvisoryLockContentionError } from "@/lib/identity/errors";

export const LOCK_PREFIX_CANONICAL_UNIT = "p1:unit:" as const;
export const LOCK_PREFIX_IDENTITY_MUTATION = "p1:idmut:" as const;

function isLockTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: string;
    message?: string;
    meta?: { code?: string; message?: string };
  };
  const code = candidate.code ?? candidate.meta?.code ?? "";
  const message = candidate.message ?? candidate.meta?.message ?? "";

  return (
    code === "55P03" ||
    message.includes("lock timeout") ||
    message.includes("canceling statement due to lock timeout")
  );
}

/** Lock-key string for canonical-unit resolve-or-create. */
export function canonicalUnitLockKey(canonicalAddressHash: string): string {
  return `${LOCK_PREFIX_CANONICAL_UNIT}${canonicalAddressHash}`;
}

/** Lock-key string for a per-unit identity mutation. */
export function identityMutationLockKey(unitId: string): string {
  return `${LOCK_PREFIX_IDENTITY_MUTATION}${unitId}`;
}

/** Acquire a transaction-scoped advisory lock. */
export async function acquireXactLock(
  tx: TransactionClient,
  key: string
): Promise<void> {
  try {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  } catch (error) {
    if (isLockTimeoutError(error)) {
      throw new AdvisoryLockContentionError();
    }
    throw error;
  }
}
