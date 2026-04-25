import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ModerationLockedError } from "@/lib/identity/errors";

export type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

export type ActorRole = "host" | "moderator" | "system";

export interface ActorContext {
  role: ActorRole;
  id: string | null;
}

export interface TransactionHost {
  $transaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: Record<string, unknown>
  ): Promise<T>;
}

function isModerationLockedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    message?: string;
    hint?: string; // PGlite surfaces HINT directly on the error object
    meta?: { message?: string; hint?: string }; // Prisma wraps it under .meta
  };
  const message = candidate.message ?? candidate.meta?.message ?? "";
  // Accept hint from both PGlite (direct property) and Prisma (meta.hint).
  const hint = candidate.hint ?? candidate.meta?.hint ?? "";

  return message.includes("MODERATION_LOCKED") || hint === "moderation";
}

function moderationReasonFromError(
  error: unknown
): ModerationLockedError["reason"] {
  if (!error || typeof error !== "object") {
    return "REVIEW";
  }

  const message = (error as { message?: string }).message ?? "";
  if (message.includes("SUPPRESSED")) {
    return "SUPPRESSED";
  }
  if (message.includes("PAUSED")) {
    return "PAUSED";
  }
  return "REVIEW";
}

export async function setActorContext(
  tx: TransactionClient,
  actor: ActorContext
): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('app.actor_role', ${actor.role}, true)
  `;
  await tx.$executeRaw`
    SELECT set_config('app.actor_id', ${actor.id ?? ""}, true)
  `;
}

/**
 * Run `fn` inside a SERIALIZABLE transaction with request-scoped actor GUCs.
 */
export async function withActor<T>(
  actor: ActorContext,
  fn: (tx: TransactionClient) => Promise<T>,
  options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    timeoutMs?: number;
    client?: TransactionHost;
  }
): Promise<T> {
  const client = options?.client ?? prisma;
  const transaction = client.$transaction as <R>(
    fn: (tx: TransactionClient) => Promise<R>,
    options?: Record<string, unknown>
  ) => Promise<R>;

  try {
    return await transaction(
      async (tx: TransactionClient) => {
        await setActorContext(tx, actor);
        return fn(tx);
      },
      {
        isolationLevel:
          options?.isolationLevel ?? Prisma.TransactionIsolationLevel.Serializable,
        timeout: options?.timeoutMs ?? 30000,
      }
    );
  } catch (error) {
    if (isModerationLockedError(error)) {
      throw new ModerationLockedError(moderationReasonFromError(error));
    }
    throw error;
  }
}
