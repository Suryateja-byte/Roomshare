import "server-only";

import type {
  EntitlementFreezeReason,
  EntitlementGrant,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/env";
import { logger, sanitizeErrorMessage } from "@/lib/logger";
import { FREE_MESSAGE_START_CONTACTS } from "@/lib/payments/catalog";
import {
  recordEntitlementStateRebuild,
  recordEntitlementStateShadowMismatch,
} from "@/lib/payments/telemetry";

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

type EntitlementStateClient = Pick<
  typeof prisma,
  "entitlementState" | "entitlementGrant" | "contactConsumption"
>;

type ClientLike = EntitlementStateClient | TransactionClient;

const ENTITLEMENT_STATE_STALE_MS = 5 * 60 * 1000;

export type EntitlementStateSnapshot = {
  userId: string;
  creditsFreeRemaining: number;
  creditsPaidRemaining: number;
  activePassWindowStart: Date | null;
  activePassWindowEnd: Date | null;
  freezeReason: EntitlementFreezeReason;
  fraudFlag: boolean;
  sourceVersion: bigint;
  lastRecomputedAt: Date;
};

type PassGrant = Pick<EntitlementGrant, "activeFrom" | "activeUntil">;
type PackGrant = Pick<EntitlementGrant, "id" | "creditCount">;

function serializeDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function resolveFreezeReason(hasFrozenGrant: boolean): EntitlementFreezeReason {
  return hasFrozenGrant ? "CHARGEBACK_PENDING" : "NONE";
}

function buildActivePassWindow(
  grants: PassGrant[],
  now: Date
): { activePassWindowStart: Date | null; activePassWindowEnd: Date | null } {
  const sorted = grants
    .filter((grant) => grant.activeUntil && grant.activeUntil > now)
    .sort((a, b) => a.activeFrom.getTime() - b.activeFrom.getTime());

  const current = sorted.find(
    (grant) =>
      grant.activeUntil !== null &&
      grant.activeFrom.getTime() <= now.getTime() &&
      grant.activeUntil.getTime() > now.getTime()
  );

  if (!current || !current.activeUntil) {
    return {
      activePassWindowStart: null,
      activePassWindowEnd: null,
    };
  }

  let windowStart = current.activeFrom;
  let windowEnd = current.activeUntil;

  for (const grant of sorted) {
    if (!grant.activeUntil) {
      continue;
    }

    if (grant.activeFrom.getTime() > windowEnd.getTime()) {
      continue;
    }

    if (grant.activeUntil.getTime() > windowEnd.getTime()) {
      windowEnd = grant.activeUntil;
    }

    if (grant.activeFrom.getTime() < windowStart.getTime()) {
      windowStart = grant.activeFrom;
    }
  }

  return {
    activePassWindowStart: windowStart,
    activePassWindowEnd: windowEnd,
  };
}

async function getActivePackUsage(
  client: ClientLike,
  grants: PackGrant[]
): Promise<Map<string, number>> {
  const usage = new Map<string, number>();

  if (grants.length === 0) {
    return usage;
  }

  const groupRows = await client.contactConsumption.groupBy({
    by: ["entitlementGrantId"],
    where: {
      entitlementGrantId: { in: grants.map((grant) => grant.id) },
      contactKind: "MESSAGE_START",
      source: "PACK",
      restorationState: "NONE",
    },
    _count: { _all: true },
  });

  for (const row of groupRows) {
    if (row.entitlementGrantId) {
      usage.set(row.entitlementGrantId, row._count._all);
    }
  }

  return usage;
}

export async function buildEntitlementStateSnapshot(
  client: ClientLike,
  userId: string,
  now: Date = new Date()
): Promise<Omit<EntitlementStateSnapshot, "sourceVersion" | "lastRecomputedAt">> {
  const [freeUsedCount, activePackGrants, activePassGrants, frozenGrant] =
    await Promise.all([
      client.contactConsumption.count({
        where: {
          userId,
          contactKind: "MESSAGE_START",
          source: "FREE",
          restorationState: "NONE",
        },
      }),
      client.entitlementGrant.findMany({
        where: {
          userId,
          contactKind: "MESSAGE_START",
          grantType: "PACK",
          status: "ACTIVE",
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          creditCount: true,
        },
      }),
      client.entitlementGrant.findMany({
        where: {
          userId,
          contactKind: "MESSAGE_START",
          grantType: "PASS",
          status: "ACTIVE",
          activeUntil: { gt: now },
        },
        orderBy: { activeFrom: "asc" },
        select: {
          activeFrom: true,
          activeUntil: true,
        },
      }),
      client.entitlementGrant.findFirst({
        where: {
          userId,
          contactKind: "MESSAGE_START",
          status: "FROZEN",
        },
        select: { id: true },
      }),
    ]);

  const packUsage = await getActivePackUsage(client, activePackGrants);
  const creditsPaidRemaining = activePackGrants.reduce((total, grant) => {
    const totalCredits = grant.creditCount ?? 0;
    const usedCredits = packUsage.get(grant.id) ?? 0;
    return total + Math.max(totalCredits - usedCredits, 0);
  }, 0);
  const creditsFreeRemaining = Math.max(
    0,
    FREE_MESSAGE_START_CONTACTS - freeUsedCount
  );
  const passWindow = buildActivePassWindow(activePassGrants, now);

  return {
    userId,
    creditsFreeRemaining,
    creditsPaidRemaining,
    activePassWindowStart: passWindow.activePassWindowStart,
    activePassWindowEnd: passWindow.activePassWindowEnd,
    freezeReason: resolveFreezeReason(!!frozenGrant),
    fraudFlag: false,
  };
}

function hasStateMismatch(
  existing:
    | Pick<
        EntitlementStateSnapshot,
        | "creditsFreeRemaining"
        | "creditsPaidRemaining"
        | "activePassWindowStart"
        | "activePassWindowEnd"
        | "freezeReason"
        | "fraudFlag"
      >
    | null,
  next: Omit<EntitlementStateSnapshot, "sourceVersion" | "lastRecomputedAt">
) {
  if (!existing) {
    return false;
  }

  return (
    existing.creditsFreeRemaining !== next.creditsFreeRemaining ||
    existing.creditsPaidRemaining !== next.creditsPaidRemaining ||
    serializeDate(existing.activePassWindowStart) !==
      serializeDate(next.activePassWindowStart) ||
    serializeDate(existing.activePassWindowEnd) !==
      serializeDate(next.activePassWindowEnd) ||
    existing.freezeReason !== next.freezeReason ||
    existing.fraudFlag !== next.fraudFlag
  );
}

export async function recomputeEntitlementState(
  client: ClientLike,
  userId: string,
  now: Date = new Date()
): Promise<EntitlementStateSnapshot> {
  const startedAt = Date.now();

  try {
    const [existing, nextSnapshot] = await Promise.all([
      client.entitlementState.findUnique({
        where: { userId },
        select: {
          creditsFreeRemaining: true,
          creditsPaidRemaining: true,
          activePassWindowStart: true,
          activePassWindowEnd: true,
          freezeReason: true,
          fraudFlag: true,
          sourceVersion: true,
        },
      }),
      buildEntitlementStateSnapshot(client, userId, now),
    ]);

    if (hasStateMismatch(existing, nextSnapshot)) {
      recordEntitlementStateShadowMismatch({
        userId,
        existingFreeRemaining: existing?.creditsFreeRemaining ?? null,
        nextFreeRemaining: nextSnapshot.creditsFreeRemaining,
        existingPaidRemaining: existing?.creditsPaidRemaining ?? null,
        nextPaidRemaining: nextSnapshot.creditsPaidRemaining,
      });
    }

    const nextSourceVersion = (existing?.sourceVersion ?? BigInt(0)) + BigInt(1);
    const lastRecomputedAt = now;

    await client.entitlementState.upsert({
      where: { userId },
      update: {
        creditsFreeRemaining: nextSnapshot.creditsFreeRemaining,
        creditsPaidRemaining: nextSnapshot.creditsPaidRemaining,
        activePassWindowStart: nextSnapshot.activePassWindowStart,
        activePassWindowEnd: nextSnapshot.activePassWindowEnd,
        freezeReason: nextSnapshot.freezeReason,
        fraudFlag: nextSnapshot.fraudFlag,
        sourceVersion: nextSourceVersion,
        lastRecomputedAt,
      },
      create: {
        userId,
        creditsFreeRemaining: nextSnapshot.creditsFreeRemaining,
        creditsPaidRemaining: nextSnapshot.creditsPaidRemaining,
        activePassWindowStart: nextSnapshot.activePassWindowStart,
        activePassWindowEnd: nextSnapshot.activePassWindowEnd,
        freezeReason: nextSnapshot.freezeReason,
        fraudFlag: nextSnapshot.fraudFlag,
        sourceVersion: nextSourceVersion,
        lastRecomputedAt,
      },
    });

    recordEntitlementStateRebuild({
      userId,
      durationMs: Date.now() - startedAt,
      rebuilt: true,
      success: true,
    });

    return {
      ...nextSnapshot,
      sourceVersion: nextSourceVersion,
      lastRecomputedAt,
    };
  } catch (error) {
    recordEntitlementStateRebuild({
      userId,
      durationMs: Date.now() - startedAt,
      rebuilt: true,
      success: false,
    });
    throw error;
  }
}

function isStateFresh(state: Pick<EntitlementStateSnapshot, "lastRecomputedAt">) {
  return Date.now() - state.lastRecomputedAt.getTime() <= ENTITLEMENT_STATE_STALE_MS;
}

export async function getFreshEntitlementState(
  client: ClientLike,
  userId: string
): Promise<
  | { ok: true; state: EntitlementStateSnapshot; rebuilt: boolean }
  | { ok: false; code: "PAYWALL_UNAVAILABLE" }
> {
  if (!features.entitlementState) {
    throw new Error("Entitlement state is disabled");
  }

  const existing = await client.entitlementState.findUnique({
    where: { userId },
    select: {
      userId: true,
      creditsFreeRemaining: true,
      creditsPaidRemaining: true,
      activePassWindowStart: true,
      activePassWindowEnd: true,
      freezeReason: true,
      fraudFlag: true,
      sourceVersion: true,
      lastRecomputedAt: true,
    },
  });

  if (existing && isStateFresh(existing)) {
    return {
      ok: true,
      state: existing,
      rebuilt: false,
    };
  }

  try {
    return {
      ok: true,
      state: await recomputeEntitlementState(client, userId),
      rebuilt: true,
    };
  } catch (error) {
    logger.sync.error("Failed to rebuild entitlement state", {
      action: "getFreshEntitlementState",
      userId,
      error: sanitizeErrorMessage(error),
    });
    return {
      ok: false,
      code: "PAYWALL_UNAVAILABLE",
    };
  }
}
