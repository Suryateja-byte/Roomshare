import "server-only";

import { prisma } from "@/lib/prisma";
import {
  AUTO_PAUSE_THRESHOLD_DAYS,
  REMINDER_THRESHOLD_DAYS,
  STALE_THRESHOLD_DAYS,
} from "@/lib/search/public-availability";
import {
  buildSearchDocListWhereConditions,
  SEARCH_DOC_ALLOWED_SQL_LITERALS,
} from "@/lib/search/search-doc-queries";
import { joinWhereClauseWithSecurityInvariant } from "@/lib/sql-safety";

interface BucketMetricsRow {
  normalCount: bigint | number | null;
  reminderCount: bigint | number | null;
  warningCount: bigint | number | null;
  autoPausedCount: bigint | number | null;
  staleStillActiveCount: bigint | number | null;
}

interface CountRow {
  count: bigint | number | null;
}

export interface FreshnessOpsMetricsSnapshot {
  freshnessBucketCounts: Record<"normal" | "reminder" | "warning" | "auto_paused", number>;
  staleInSearchCount: number;
  staleStillActiveCount: number;
  legacyEligibleCount: number;
}

function normalizeCount(value: bigint | number | null | undefined): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function getFreshnessOpsMetricsSnapshot(): Promise<FreshnessOpsMetricsSnapshot> {
  const bucketRows = await prisma.$queryRaw<BucketMetricsRow[]>`
    SELECT
      COUNT(*) FILTER (
        WHERE l."availabilitySource" = 'HOST_MANAGED'
          AND l."lastConfirmedAt" IS NOT NULL
          AND NOT (l.status = 'PAUSED' AND l."statusReason" = 'STALE_AUTO_PAUSE')
          AND l."lastConfirmedAt" > NOW() - make_interval(days => ${REMINDER_THRESHOLD_DAYS})
      ) AS "normalCount",
      COUNT(*) FILTER (
        WHERE l."availabilitySource" = 'HOST_MANAGED'
          AND l."lastConfirmedAt" IS NOT NULL
          AND NOT (l.status = 'PAUSED' AND l."statusReason" = 'STALE_AUTO_PAUSE')
          AND l."lastConfirmedAt" <= NOW() - make_interval(days => ${REMINDER_THRESHOLD_DAYS})
          AND l."lastConfirmedAt" > NOW() - make_interval(days => ${STALE_THRESHOLD_DAYS})
      ) AS "reminderCount",
      COUNT(*) FILTER (
        WHERE l."availabilitySource" = 'HOST_MANAGED'
          AND l."lastConfirmedAt" IS NOT NULL
          AND NOT (l.status = 'PAUSED' AND l."statusReason" = 'STALE_AUTO_PAUSE')
          AND l."lastConfirmedAt" <= NOW() - make_interval(days => ${STALE_THRESHOLD_DAYS})
      ) AS "warningCount",
      COUNT(*) FILTER (
        WHERE l."availabilitySource" = 'HOST_MANAGED'
          AND l.status = 'PAUSED'
          AND l."statusReason" = 'STALE_AUTO_PAUSE'
      ) AS "autoPausedCount",
      COUNT(*) FILTER (
        WHERE l."availabilitySource" = 'HOST_MANAGED'
          AND l.status = 'ACTIVE'
          AND l."lastConfirmedAt" IS NOT NULL
          AND l."lastConfirmedAt" <= NOW() - make_interval(days => ${AUTO_PAUSE_THRESHOLD_DAYS})
      ) AS "staleStillActiveCount"
    FROM "Listing" l
  `;

  const bucketRow = Array.isArray(bucketRows) ? bucketRows[0] : undefined;
  const staleInSearchCount = await getStaleInSearchCount();
  const legacyEligibleCount = await getLegacyEligibleCount();

  return {
    freshnessBucketCounts: {
      normal: normalizeCount(bucketRow?.normalCount),
      reminder: normalizeCount(bucketRow?.reminderCount),
      warning: normalizeCount(bucketRow?.warningCount),
      auto_paused: normalizeCount(bucketRow?.autoPausedCount),
    },
    staleInSearchCount,
    staleStillActiveCount: normalizeCount(bucketRow?.staleStillActiveCount),
    legacyEligibleCount,
  };
}

async function getStaleInSearchCount(): Promise<number> {
  if (typeof prisma.$queryRawUnsafe !== "function") {
    return 0;
  }

  const whereBuilder = buildSearchDocListWhereConditions({});
  const staleDaysParamIndex = whereBuilder.paramIndex;
  const conditions = [
    ...whereBuilder.conditions,
    `l."availabilitySource" = 'HOST_MANAGED'`,
    `l."lastConfirmedAt" IS NOT NULL`,
    `l."lastConfirmedAt" <= NOW() - make_interval(days => $${staleDaysParamIndex})`,
  ];
  const whereClause = joinWhereClauseWithSecurityInvariant(
    conditions,
    SEARCH_DOC_ALLOWED_SQL_LITERALS
  );
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(
    `
      SELECT COUNT(*) AS count
      FROM listing_search_docs d
      JOIN "Listing" l ON l.id = d.id
      WHERE ${whereClause}
    `,
    ...whereBuilder.params,
    STALE_THRESHOLD_DAYS
  );

  return normalizeCount(Array.isArray(rows) ? rows[0]?.count : 0);
}

async function getLegacyEligibleCount(): Promise<number> {
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS count
    FROM (
      SELECT DISTINCT b."tenantId", b."listingId"
      FROM "Booking" b
      WHERE b.status = 'ACCEPTED'
        AND b."tenantId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "Review" r
          WHERE r."authorId" = b."tenantId"
            AND r."listingId" = b."listingId"
        )
    ) AS eligible_pairs
  `;

  return normalizeCount(Array.isArray(rows) ? rows[0]?.count : 0);
}
