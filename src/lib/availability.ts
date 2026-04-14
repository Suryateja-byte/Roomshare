import "server-only";

import { Prisma } from "@prisma/client";

import { logBookingAudit } from "@/lib/booking-audit";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

type QueryClient = Prisma.TransactionClient | typeof prisma;

export interface AvailabilitySnapshot {
  listingId: string;
  totalSlots: number;
  effectiveAvailableSlots: number;
  heldSlots: number;
  acceptedSlots: number;
  rangeVersion: number;
  asOf: string;
}

export interface AvailabilitySqlFragments {
  effectiveAvailableSql: string;
  slotConditionSql: string;
  params: unknown[];
  nextParamIndex: number;
}

function getUtcDateOnlyMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function getRangeDayCount(startDate: Date, endDate: Date): number {
  return Math.max(
    0,
    Math.round((getUtcDateOnlyMs(endDate) - getUtcDateOnlyMs(startDate)) / DAY_MS)
  );
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(getUtcDateOnlyMs(date) + days * DAY_MS);
}

function resolveAvailabilityWindow(
  startDate?: Date | null,
  endDate?: Date | null
): { windowStart: Date; windowEnd: Date } {
  if (startDate && endDate) {
    return { windowStart: startDate, windowEnd: endDate };
  }

  if (startDate) {
    return { windowStart: startDate, windowEnd: addUtcDays(startDate, 1) };
  }

  const today = new Date();
  return { windowStart: today, windowEnd: addUtcDays(today, 1) };
}

export function isCapacityReservation(
  status: string,
  heldUntil: Date | null | undefined,
  now: Date = new Date()
): boolean {
  return (
    status === "ACCEPTED" ||
    (status === "HELD" &&
      heldUntil instanceof Date &&
      heldUntil.getTime() > now.getTime())
  );
}

export function buildAvailabilitySqlFragments(options: {
  listingIdRef: string;
  totalSlotsRef: string;
  minAvailableSlots?: number;
  startDate?: string;
  endDate?: string;
  startParamIndex: number;
}): AvailabilitySqlFragments {
  const {
    listingIdRef,
    totalSlotsRef,
    minAvailableSlots,
    startDate,
    endDate,
    startParamIndex,
  } = options;

  const slotThreshold = Math.max(minAvailableSlots ?? 1, 1);
  const params: unknown[] = [];
  let paramIndex = startParamIndex;

  let daySeriesSql: string;
  if (startDate && endDate) {
    const startParam = `$${paramIndex++}`;
    const endParam = `$${paramIndex++}`;
    params.push(startDate, endDate);
    daySeriesSql = `generate_series(${startParam}::date, (${endParam}::date - INTERVAL '1 day')::date, INTERVAL '1 day')`;
  } else if (startDate) {
    const startParam = `$${paramIndex++}`;
    params.push(startDate);
    daySeriesSql = `generate_series(${startParam}::date, ${startParam}::date, INTERVAL '1 day')`;
  } else {
    daySeriesSql = "generate_series(CURRENT_DATE, CURRENT_DATE, INTERVAL '1 day')";
  }

  const effectiveAvailableSql = `
    (
      SELECT COALESCE(
        MIN(
          GREATEST(
            ${totalSlotsRef}
            - COALESCE(day_usage.accepted_slots, 0)
            - COALESCE(day_usage.held_slots, 0),
            0
          )
        ),
        ${totalSlotsRef}
      )::int
      FROM ${daySeriesSql} AS requested_day(day)
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN b.status = 'ACCEPTED' THEN b."slotsRequested"
                ELSE 0
              END
            ),
            0
          )::int AS accepted_slots,
          COALESCE(
            SUM(
              CASE
                WHEN b.status = 'HELD' AND b."heldUntil" > NOW()
                  THEN b."slotsRequested"
                ELSE 0
              END
            ),
            0
          )::int AS held_slots
        FROM "Booking" b
        WHERE b."listingId" = ${listingIdRef}
          AND b."startDate"::date <= requested_day.day::date
          AND b."endDate"::date > requested_day.day::date
          AND (
            b.status = 'ACCEPTED'
            OR (b.status = 'HELD' AND b."heldUntil" > NOW())
          )
      ) day_usage ON TRUE
    )
  `.trim();

  const slotParam = `$${paramIndex++}`;
  params.push(slotThreshold);

  return {
    effectiveAvailableSql,
    slotConditionSql: `${effectiveAvailableSql} >= ${slotParam}`,
    params,
    nextParamIndex: paramIndex,
  };
}

export async function getAvailability(
  listingId: string,
  options: {
    startDate?: Date | null;
    endDate?: Date | null;
    now?: Date;
    tx?: QueryClient;
  } = {}
): Promise<AvailabilitySnapshot | null> {
  const db = options.tx ?? prisma;
  const now = options.now ?? new Date();
  const { windowStart, windowEnd } = resolveAvailabilityWindow(
    options.startDate,
    options.endDate
  );

  const [result] = await db.$queryRaw<
    Array<{
      listingId: string;
      totalSlots: number;
      effectiveAvailableSlots: number;
      heldSlots: number;
      acceptedSlots: number;
      rangeVersion: bigint | number | null;
    }>
  >`
    WITH requested_days AS (
      SELECT day::date AS day
      FROM generate_series(
        ${windowStart}::date,
        (${windowEnd}::date - INTERVAL '1 day')::date,
        INTERVAL '1 day'
      ) AS day
    ),
    daily_capacity AS (
      SELECT
        l.id AS "listingId",
        l."totalSlots"::int AS "totalSlots",
        requested_days.day AS day,
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'ACCEPTED' THEN b."slotsRequested"
              ELSE 0
            END
          ),
          0
        )::int AS "acceptedSlots",
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'HELD' AND b."heldUntil" > ${now}
                THEN b."slotsRequested"
              ELSE 0
            END
          ),
          0
        )::int AS "heldSlots",
        GREATEST(
          l."totalSlots"::int
          - COALESCE(
              SUM(
                CASE
                  WHEN b.status = 'ACCEPTED' THEN b."slotsRequested"
                  ELSE 0
                END
              ),
              0
            )::int
          - COALESCE(
              SUM(
                CASE
                  WHEN b.status = 'HELD' AND b."heldUntil" > ${now}
                    THEN b."slotsRequested"
                  ELSE 0
                END
              ),
              0
            )::int,
          0
        )::int AS "freeSlots"
      FROM "Listing" l
      CROSS JOIN requested_days
      LEFT JOIN "Booking" b
        ON b."listingId" = l.id
        AND b."startDate"::date <= requested_days.day
        AND b."endDate"::date > requested_days.day
        AND (
          b.status = 'ACCEPTED'
          OR (b.status = 'HELD' AND b."heldUntil" > ${now})
        )
      WHERE l.id = ${listingId}
      GROUP BY l.id, l."totalSlots", requested_days.day
    ),
    overlapping_updates AS (
      SELECT COALESCE(MAX(EXTRACT(EPOCH FROM b."updatedAt"))::bigint, 0) AS version
      FROM "Booking" b
      WHERE b."listingId" = ${listingId}
        AND b."startDate" < ${windowEnd}
        AND b."endDate" > ${windowStart}
    )
    SELECT
      dc."listingId",
      MAX(dc."totalSlots")::int AS "totalSlots",
      MIN(dc."freeSlots")::int AS "effectiveAvailableSlots",
      MAX(dc."heldSlots")::int AS "heldSlots",
      MAX(dc."acceptedSlots")::int AS "acceptedSlots",
      overlapping_updates.version AS "rangeVersion"
    FROM daily_capacity dc
    CROSS JOIN overlapping_updates
    GROUP BY dc."listingId", overlapping_updates.version
  `;

  if (!result) {
    return null;
  }

  return {
    listingId: result.listingId,
    totalSlots: Number(result.totalSlots),
    effectiveAvailableSlots: Number(result.effectiveAvailableSlots),
    heldSlots: Number(result.heldSlots),
    acceptedSlots: Number(result.acceptedSlots),
    rangeVersion: Number(result.rangeVersion ?? 0),
    asOf: now.toISOString(),
  };
}

export async function getAvailabilityForListings(
  listingIds: string[],
  options: {
    startDate?: Date | null;
    endDate?: Date | null;
    now?: Date;
    tx?: QueryClient;
  } = {}
): Promise<Map<string, AvailabilitySnapshot>> {
  const db = options.tx ?? prisma;
  const now = options.now ?? new Date();
  const { windowStart, windowEnd } = resolveAvailabilityWindow(
    options.startDate,
    options.endDate
  );

  if (listingIds.length === 0) {
    return new Map();
  }

  const rows = await db.$queryRaw<
    Array<{
      listingId: string;
      totalSlots: number;
      effectiveAvailableSlots: number;
      heldSlots: number;
      acceptedSlots: number;
      rangeVersion: bigint | number | null;
    }>
  >`
    WITH target_listings AS (
      SELECT l.id, l."totalSlots"
      FROM "Listing" l
      WHERE l.id = ANY(${listingIds})
    ),
    requested_days AS (
      SELECT day::date AS day
      FROM generate_series(
        ${windowStart}::date,
        (${windowEnd}::date - INTERVAL '1 day')::date,
        INTERVAL '1 day'
      ) AS day
    ),
    daily_capacity AS (
      SELECT
        t.id AS "listingId",
        t."totalSlots"::int AS "totalSlots",
        requested_days.day AS day,
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'ACCEPTED' THEN b."slotsRequested"
              ELSE 0
            END
          ),
          0
        )::int AS "acceptedSlots",
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'HELD' AND b."heldUntil" > ${now}
                THEN b."slotsRequested"
              ELSE 0
            END
          ),
          0
        )::int AS "heldSlots",
        GREATEST(
          t."totalSlots"::int
          - COALESCE(
              SUM(
                CASE
                  WHEN b.status = 'ACCEPTED' THEN b."slotsRequested"
                  ELSE 0
                END
              ),
              0
            )::int
          - COALESCE(
              SUM(
                CASE
                  WHEN b.status = 'HELD' AND b."heldUntil" > ${now}
                    THEN b."slotsRequested"
                  ELSE 0
                END
              ),
              0
            )::int,
          0
        )::int AS "freeSlots"
      FROM target_listings t
      CROSS JOIN requested_days
      LEFT JOIN "Booking" b
        ON b."listingId" = t.id
        AND b."startDate"::date <= requested_days.day
        AND b."endDate"::date > requested_days.day
        AND (
          b.status = 'ACCEPTED'
          OR (b.status = 'HELD' AND b."heldUntil" > ${now})
        )
      GROUP BY t.id, t."totalSlots", requested_days.day
    ),
    overlap_versions AS (
      SELECT
        t.id AS "listingId",
        COALESCE(MAX(EXTRACT(EPOCH FROM b."updatedAt"))::bigint, 0) AS version
      FROM target_listings t
      LEFT JOIN "Booking" b
        ON b."listingId" = t.id
        AND b."startDate" < ${windowEnd}
        AND b."endDate" > ${windowStart}
      GROUP BY t.id
    )
    SELECT
      dc."listingId",
      MAX(dc."totalSlots")::int AS "totalSlots",
      MIN(dc."freeSlots")::int AS "effectiveAvailableSlots",
      MAX(dc."heldSlots")::int AS "heldSlots",
      MAX(dc."acceptedSlots")::int AS "acceptedSlots",
      overlap_versions.version AS "rangeVersion"
    FROM daily_capacity dc
    JOIN overlap_versions
      ON overlap_versions."listingId" = dc."listingId"
    GROUP BY dc."listingId", overlap_versions.version
  `;

  return new Map(
    rows.map((row) => [
      row.listingId,
      {
        listingId: row.listingId,
        totalSlots: Number(row.totalSlots),
        effectiveAvailableSlots: Number(row.effectiveAvailableSlots),
        heldSlots: Number(row.heldSlots),
        acceptedSlots: Number(row.acceptedSlots),
        rangeVersion: Number(row.rangeVersion ?? 0),
        asOf: now.toISOString(),
      },
    ])
  );
}

export async function canReserve(
  listingId: string,
  options: {
    startDate: Date;
    endDate: Date;
    slotsRequested: number;
    now?: Date;
    tx?: QueryClient;
  }
): Promise<AvailabilitySnapshot | null> {
  const snapshot = await getAvailability(listingId, options);
  if (!snapshot) {
    return null;
  }

  if (snapshot.effectiveAvailableSlots < options.slotsRequested) {
    return snapshot;
  }

  return snapshot;
}

export async function materializeListingDayInventory(
  tx: Prisma.TransactionClient,
  listingId: string,
  startDate: Date,
  endDate: Date,
  totalSlots: number
): Promise<void> {
  if (getRangeDayCount(startDate, endDate) === 0) {
    return;
  }

  await tx.$executeRaw`
    INSERT INTO listing_day_inventory (
      listing_id,
      day,
      total_slots,
      held_slots,
      accepted_slots,
      version,
      updated_at
    )
    SELECT
      ${listingId},
      requested_day.day::date,
      ${totalSlots},
      0,
      0,
      0,
      NOW()
    FROM generate_series(
      ${startDate}::date,
      (${endDate}::date - INTERVAL '1 day')::date,
      INTERVAL '1 day'
    ) AS requested_day(day)
    ON CONFLICT (listing_id, day) DO NOTHING
  `;
}

export async function applyInventoryDeltas(
  tx: Prisma.TransactionClient,
  options: {
    listingId: string;
    startDate: Date;
    endDate: Date;
    totalSlots: number;
    heldDelta?: number;
    acceptedDelta?: number;
  }
): Promise<void> {
  const heldDelta = options.heldDelta ?? 0;
  const acceptedDelta = options.acceptedDelta ?? 0;
  const dayCount = getRangeDayCount(options.startDate, options.endDate);

  if (dayCount === 0 || (heldDelta === 0 && acceptedDelta === 0)) {
    return;
  }

  await materializeListingDayInventory(
    tx,
    options.listingId,
    options.startDate,
    options.endDate,
    options.totalSlots
  );

  const updatedRows = await tx.$executeRaw`
    UPDATE listing_day_inventory
    SET
      total_slots = ${options.totalSlots},
      held_slots = held_slots + ${heldDelta},
      accepted_slots = accepted_slots + ${acceptedDelta},
      version = version + 1,
      updated_at = NOW()
    WHERE listing_id = ${options.listingId}
      AND day >= ${options.startDate}::date
      AND day < ${options.endDate}::date
      AND held_slots + ${heldDelta} >= 0
      AND accepted_slots + ${acceptedDelta} >= 0
      AND ${options.totalSlots} >= held_slots + accepted_slots + ${heldDelta} + ${acceptedDelta}
  `;

  if (updatedRows !== dayCount) {
    throw new Error("INVENTORY_DELTA_CONFLICT");
  }
}

export async function syncFutureInventoryTotalSlots(
  tx: Prisma.TransactionClient,
  listingId: string,
  totalSlots: number,
  fromDate: Date = new Date()
): Promise<void> {
  await tx.$executeRaw`
    UPDATE listing_day_inventory
    SET
      total_slots = ${totalSlots},
      version = version + 1,
      updated_at = NOW()
    WHERE listing_id = ${listingId}
      AND day >= ${fromDate}::date
  `;
}

export async function getFuturePeakReservedLoad(
  tx: Prisma.TransactionClient,
  listingId: string,
  fromDate: Date = new Date()
): Promise<number> {
  const [result] = await tx.$queryRaw<Array<{ peak: bigint | number | null }>>`
    SELECT COALESCE(MAX(held_slots + accepted_slots), 0) AS peak
    FROM listing_day_inventory
    WHERE listing_id = ${listingId}
      AND day >= ${fromDate}::date
  `;

  return Number(result?.peak ?? 0);
}

export async function expireOverlappingExpiredHolds(
  tx: Prisma.TransactionClient,
  options: {
    listingId: string;
    startDate: Date;
    endDate: Date;
  }
): Promise<number> {
  const expiredHolds = await tx.$queryRaw<
    Array<{
      id: string;
      slotsRequested: number;
      startDate: Date;
      endDate: Date;
      heldUntil: Date | null;
      totalSlots: number;
    }>
  >`
    SELECT
      b.id,
      b."slotsRequested",
      b."startDate",
      b."endDate",
      b."heldUntil",
      l."totalSlots"::int AS "totalSlots"
    FROM "Booking" b
    JOIN "Listing" l ON l.id = b."listingId"
    WHERE b."listingId" = ${options.listingId}
      AND b.status = 'HELD'
      AND b."heldUntil" <= NOW()
      AND b."startDate" < ${options.endDate}
      AND b."endDate" > ${options.startDate}
    FOR UPDATE OF b
  `;

  let expiredCount = 0;

  for (const hold of expiredHolds) {
    const updated = await tx.$executeRaw`
      UPDATE "Booking"
      SET
        status = 'EXPIRED'::"BookingStatus",
        "heldUntil" = NULL,
        version = version + 1,
        "updatedAt" = NOW()
      WHERE id = ${hold.id}
        AND status = 'HELD'::"BookingStatus"
    `;

    if (updated === 0) {
      continue;
    }

    await tx.$executeRaw`
      UPDATE "Listing"
      SET "availableSlots" = LEAST("availableSlots" + ${hold.slotsRequested}, "totalSlots")
      WHERE id = ${options.listingId}
    `;

    await applyInventoryDeltas(tx, {
      listingId: options.listingId,
      startDate: hold.startDate,
      endDate: hold.endDate,
      totalSlots: hold.totalSlots,
      heldDelta: -hold.slotsRequested,
    });

    await logBookingAudit(tx, {
      bookingId: hold.id,
      action: "EXPIRED",
      previousStatus: "HELD",
      newStatus: "EXPIRED",
      actorId: null,
      actorType: "SYSTEM",
      details: {
        mechanism: "inline_expiry",
        slotsRequested: hold.slotsRequested,
        heldUntil: hold.heldUntil?.toISOString() ?? null,
      },
    });

    expiredCount += 1;
  }

  return expiredCount;
}

export async function rebuildListingDayInventory(
  tx: Prisma.TransactionClient,
  listingId: string,
  fromDate: Date = new Date()
): Promise<void> {
  const listing = await tx.listing.findUnique({
    where: { id: listingId },
    select: { totalSlots: true },
  });

  if (!listing) {
    return;
  }

  await tx.$executeRaw`
    DELETE FROM listing_day_inventory
    WHERE listing_id = ${listingId}
      AND day >= ${fromDate}::date
  `;

  await tx.$executeRaw`
    INSERT INTO listing_day_inventory (
      listing_id,
      day,
      total_slots,
      held_slots,
      accepted_slots,
      version,
      updated_at
    )
    WITH requested_days AS (
      SELECT requested_day.day::date AS day
      FROM "Booking" b
      JOIN LATERAL generate_series(
        b."startDate"::date,
        (b."endDate"::date - INTERVAL '1 day')::date,
        INTERVAL '1 day'
      ) AS requested_day(day)
        ON b."endDate"::date > b."startDate"::date
      WHERE b."listingId" = ${listingId}
        AND b."endDate"::date > ${fromDate}::date
        AND (
          b.status = 'ACCEPTED'
          OR (b.status = 'HELD' AND b."heldUntil" > NOW())
        )
      GROUP BY requested_day.day::date
    )
    SELECT
      ${listingId},
      requested_days.day,
      ${listing.totalSlots},
      COALESCE(
        SUM(
          CASE
            WHEN b.status = 'HELD' AND b."heldUntil" > NOW()
              THEN b."slotsRequested"
            ELSE 0
          END
        ),
        0
      )::int,
      COALESCE(
        SUM(
          CASE
            WHEN b.status = 'ACCEPTED' THEN b."slotsRequested"
            ELSE 0
          END
        ),
        0
      )::int,
      1,
      NOW()
    FROM requested_days
    LEFT JOIN "Booking" b
      ON b."listingId" = ${listingId}
      AND b."startDate"::date <= requested_days.day
      AND b."endDate"::date > requested_days.day
      AND (
        b.status = 'ACCEPTED'
        OR (b.status = 'HELD' AND b."heldUntil" > NOW())
      )
    GROUP BY requested_days.day
  `;
}
