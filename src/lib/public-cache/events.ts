import "server-only";

import { prisma } from "@/lib/prisma";
import {
  buildPublicCacheFloorToken,
  buildPublicUnitCacheKey,
  normalizeCacheInvalidationReason,
  parsePublicCacheCursorToken,
  signPublicCacheCursor,
} from "@/lib/public-cache/cache-policy";

export interface PublicCacheInvalidationEvent {
  type: "public-cache.invalidate";
  cursor: string;
  cacheFloorToken: string;
  unitCacheKey: string;
  projectionEpoch: string;
  unitIdentityEpoch: number;
  reason: string;
  enqueuedAt: string;
  emittedAt: string;
}

interface CacheInvalidationEventRow {
  id: string;
  unit_id: string;
  projection_epoch: bigint | number | string;
  unit_identity_epoch: number;
  reason: string;
  enqueued_at: Date;
}

export function buildPublicCacheInvalidationEvent(
  row: CacheInvalidationEventRow,
  emittedAt = new Date()
): PublicCacheInvalidationEvent {
  const cursor = signPublicCacheCursor({
    id: row.id,
    enqueuedAt: row.enqueued_at,
  });

  return {
    type: "public-cache.invalidate",
    cursor: cursor ?? "",
    cacheFloorToken: buildPublicCacheFloorToken({
      id: row.id,
      enqueuedAt: row.enqueued_at,
    }),
    unitCacheKey: buildPublicUnitCacheKey(
      row.unit_id,
      Number(row.unit_identity_epoch)
    ),
    projectionEpoch: String(row.projection_epoch),
    unitIdentityEpoch: Number(row.unit_identity_epoch),
    reason: normalizeCacheInvalidationReason(row.reason),
    enqueuedAt: row.enqueued_at.toISOString(),
    emittedAt: emittedAt.toISOString(),
  };
}

export async function listPublicCacheInvalidationEventsAfter(
  cursorToken: string | null,
  limit = 50
): Promise<PublicCacheInvalidationEvent[]> {
  const cursor = parsePublicCacheCursorToken(cursorToken);
  const boundedLimit = Math.min(Math.max(limit, 1), 100);

  const rows = cursor
    ? await prisma.$queryRaw<CacheInvalidationEventRow[]>`
        SELECT id, unit_id, projection_epoch, unit_identity_epoch, reason, enqueued_at
        FROM cache_invalidations
        WHERE enqueued_at > ${cursor.enqueuedAt}
           OR (enqueued_at = ${cursor.enqueuedAt} AND id > ${cursor.id})
        ORDER BY enqueued_at ASC, id ASC
        LIMIT ${boundedLimit}
      `
    : await prisma.$queryRaw<CacheInvalidationEventRow[]>`
        SELECT id, unit_id, projection_epoch, unit_identity_epoch, reason, enqueued_at
        FROM cache_invalidations
        ORDER BY enqueued_at ASC, id ASC
        LIMIT ${boundedLimit}
      `;

  const emittedAt = new Date();
  return rows.map((row) => buildPublicCacheInvalidationEvent(row, emittedAt));
}
