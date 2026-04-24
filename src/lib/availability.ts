import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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

function toPositiveSlotThreshold(value: number | undefined): number {
  return Math.max(value ?? 1, 1);
}

function toSnapshot(row: {
  id: string;
  totalSlots: number | null;
  openSlots: number | null;
  availableSlots: number | null;
  version: number | null;
}, now: Date): AvailabilitySnapshot {
  const totalSlots = Math.max(Number(row.totalSlots ?? 0), 0);
  const openSlots = Math.max(
    Number(row.openSlots ?? row.availableSlots ?? totalSlots),
    0
  );

  return {
    listingId: row.id,
    totalSlots,
    effectiveAvailableSlots: Math.min(openSlots, totalSlots),
    heldSlots: 0,
    acceptedSlots: 0,
    rangeVersion: Number(row.version ?? 0),
    asOf: now.toISOString(),
  };
}

export function isCapacityReservation(): boolean {
  return false;
}

export function buildAvailabilitySqlFragments(options: {
  listingIdRef: string;
  totalSlotsRef: string;
  minAvailableSlots?: number;
  startDate?: string;
  endDate?: string;
  startParamIndex: number;
}): AvailabilitySqlFragments {
  const slotThreshold = toPositiveSlotThreshold(options.minAvailableSlots);
  const slotParam = `$${options.startParamIndex}`;
  const effectiveAvailableSql = options.totalSlotsRef;

  return {
    effectiveAvailableSql,
    slotConditionSql: `${effectiveAvailableSql} >= ${slotParam}`,
    params: [slotThreshold],
    nextParamIndex: options.startParamIndex + 1,
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
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      totalSlots: true,
      openSlots: true,
      availableSlots: true,
      version: true,
    },
  });

  return listing ? toSnapshot(listing, now) : null;
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
  if (listingIds.length === 0) {
    return new Map();
  }

  const db = options.tx ?? prisma;
  const now = options.now ?? new Date();
  const rows = await db.listing.findMany({
    where: { id: { in: listingIds } },
    select: {
      id: true,
      totalSlots: true,
      openSlots: true,
      availableSlots: true,
      version: true,
    },
  });

  return new Map(rows.map((row) => [row.id, toSnapshot(row, now)]));
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

  return snapshot.effectiveAvailableSlots < options.slotsRequested
    ? snapshot
    : snapshot;
}

export async function applyInventoryDeltas(): Promise<void> {
  return;
}

export async function syncFutureInventoryTotalSlots(): Promise<void> {
  return;
}

export async function getFuturePeakReservedLoad(): Promise<number> {
  return 0;
}

export async function expireOverlappingExpiredHolds(): Promise<number> {
  return 0;
}
