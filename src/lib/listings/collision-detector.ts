import type { Prisma } from "@prisma/client";

export type PrismaTx = Prisma.TransactionClient;

export type CollisionSibling = {
  id: string;
  title: string;
  moveInDate: string | null;
  availableUntil: string | null;
  openSlots: number | null;
  totalSlots: number;
  createdAt: string;
  status: string;
  statusReason: string | null;
  canUpdate: boolean;
};

export type CollisionCheckInput = {
  ownerId: string;
  normalizedAddress: string;
  moveInDate: Date | string | null;
  availableUntil: Date | string | null;
  tx: PrismaTx;
};

type CollisionSiblingRow = Omit<CollisionSibling, "canUpdate">;

export type CollisionRateLimitOutcome = {
  windowCount: number;
  needsModeration: boolean;
};

function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
    if (directMatch) {
      return directMatch[1];
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function canUpdateCollisionSibling(
  status: string,
  statusReason: string | null
): boolean {
  return (
    status === "ACTIVE" ||
    (status === "PAUSED" &&
      (statusReason === null || statusReason === "HOST_PAUSED"))
  );
}

export async function findCollisions(
  input: CollisionCheckInput
): Promise<CollisionSibling[]> {
  const normalizedAddress = input.normalizedAddress?.trim();
  if (!normalizedAddress) {
    return [];
  }

  const moveInDate = toDateOnlyString(input.moveInDate);
  if (!moveInDate) {
    return [];
  }

  const availableUntil = toDateOnlyString(input.availableUntil);

  const rows = await input.tx.$queryRaw<CollisionSiblingRow[]>`
    SELECT
      l.id,
      l.title,
      l."moveInDate"::text AS "moveInDate",
      l."availableUntil"::text AS "availableUntil",
      l."openSlots",
      l."totalSlots",
      l."createdAt"::text AS "createdAt",
      l.status::text AS status,
      l."statusReason"
    FROM "Listing" l
    WHERE l."ownerId" = ${input.ownerId}
      AND l.status IN ('ACTIVE', 'PAUSED')
      AND l."normalizedAddress" = ${normalizedAddress}
      AND (
        l."moveInDate" IS NOT NULL
        AND l."moveInDate"::date <= COALESCE(${availableUntil ?? moveInDate}::date, l."moveInDate"::date)
      )
      AND (
        l."availableUntil" IS NULL
        OR l."availableUntil"::date >= ${moveInDate}::date
      )
    LIMIT 5
  `;

  return rows.map((row) => ({
    ...row,
    canUpdate: canUpdateCollisionSibling(row.status, row.statusReason),
  }));
}

export async function checkCollisionRateLimit(input: {
  ownerId: string;
  normalizedAddress: string;
  tx: PrismaTx;
  thresholdPerDay?: number;
}): Promise<CollisionRateLimitOutcome> {
  const thresholdPerDay = input.thresholdPerDay ?? 4;
  const normalizedAddress = input.normalizedAddress?.trim();
  if (!normalizedAddress) {
    return { windowCount: 0, needsModeration: false };
  }

  // Count same-owner listings at the same normalizedAddress created in the
  // trailing 24h window. This is the honest "collisions at this address"
  // signal — counting only moderation-gated rows would be circular because
  // rows under the threshold never get flagged and therefore never count.
  const [result] = await input.tx.$queryRaw<[{ count: number }]>`
    SELECT COUNT(*)::int AS count
    FROM "Listing"
    WHERE "ownerId" = ${input.ownerId}
      AND "normalizedAddress" = ${normalizedAddress}
      AND "createdAt" > NOW() - INTERVAL '24 hours'
  `;

  const windowCount = result?.count ?? 0;

  // The incoming create is the Nth; we've counted the (N-1) prior. Trigger
  // moderation when this one would be the thresholdPerDay-th or beyond.
  return {
    windowCount,
    needsModeration: windowCount >= Math.max(0, thresholdPerDay - 1),
  };
}
