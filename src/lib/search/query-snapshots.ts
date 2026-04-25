import "server-only";

import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNamespace } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SearchBackendSource, SearchResponseMeta } from "./search-response";
import type { SearchV2Map } from "./types";

export const QUERY_SNAPSHOT_MAX_LISTING_IDS = 256;
export const QUERY_SNAPSHOT_MAX_UNIT_KEYS = 256;
export const QUERY_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
export const PHASE04_SNAPSHOT_VERSION = "phase04-unit-v1";

export type SnapshotExpiredReason =
  | "search_contract_changed"
  | "snapshot_missing"
  | "snapshot_expired";

export interface QuerySnapshotVersionMeta {
  projectionVersion?: number;
  projectionEpoch?: bigint | number | string | null;
  embeddingVersion?: string;
  rankerProfileVersion?: string;
  unitIdentityEpochFloor?: number;
  snapshotVersion?: string;
}

export interface CreateQuerySnapshotInput extends QuerySnapshotVersionMeta {
  queryHash: string;
  backendSource: SearchBackendSource;
  responseVersion: string;
  orderedListingIds: string[];
  orderedUnitKeys?: string[];
  mapPayload?: SearchV2Map | null;
  total?: number | null;
  ttlMs?: number;
}

type QuerySnapshotRecord = Prisma.QuerySnapshotGetPayload<Record<string, never>>;

export function getQuerySnapshotExpiryDate(ttlMs: number = QUERY_SNAPSHOT_TTL_MS) {
  return new Date(Date.now() + ttlMs);
}

export function toSnapshotResponseMeta(
  snapshot: Pick<
    QuerySnapshotRecord,
    | "id"
    | "queryHash"
    | "backendSource"
    | "responseVersion"
    | "projectionVersion"
    | "projectionEpoch"
    | "embeddingVersion"
    | "rankerProfileVersion"
    | "unitIdentityEpochFloor"
    | "snapshotVersion"
  >
): SearchResponseMeta {
  return {
    queryHash: snapshot.queryHash,
    querySnapshotId: snapshot.id,
    backendSource: snapshot.backendSource as SearchBackendSource,
    responseVersion: snapshot.responseVersion,
    ...(snapshot.projectionVersion !== null &&
    snapshot.projectionVersion !== undefined
      ? { projectionVersion: snapshot.projectionVersion }
      : {}),
    ...(snapshot.projectionEpoch !== null &&
    snapshot.projectionEpoch !== undefined
      ? { projectionEpoch: String(snapshot.projectionEpoch) }
      : {}),
    ...(snapshot.embeddingVersion
      ? { embeddingVersion: snapshot.embeddingVersion }
      : {}),
    ...(snapshot.rankerProfileVersion
      ? { rankerProfileVersion: snapshot.rankerProfileVersion }
      : {}),
    ...(snapshot.unitIdentityEpochFloor !== null &&
    snapshot.unitIdentityEpochFloor !== undefined
      ? { unitIdentityEpochFloor: snapshot.unitIdentityEpochFloor }
      : {}),
    ...(snapshot.snapshotVersion
      ? { snapshotVersion: snapshot.snapshotVersion }
      : {}),
  };
}

export async function createQuerySnapshot(
  input: CreateQuerySnapshotInput
): Promise<QuerySnapshotRecord> {
  const orderedListingIds = Array.from(new Set(input.orderedListingIds)).slice(
    0,
    QUERY_SNAPSHOT_MAX_LISTING_IDS
  );
  const orderedUnitKeys = Array.from(new Set(input.orderedUnitKeys ?? [])).slice(
    0,
    QUERY_SNAPSHOT_MAX_UNIT_KEYS
  );

  return prisma.querySnapshot.create({
    data: {
      queryHash: input.queryHash,
      backendSource: input.backendSource,
      responseVersion: input.responseVersion,
      projectionVersion: input.projectionVersion,
      projectionEpoch:
        input.projectionEpoch !== null && input.projectionEpoch !== undefined
          ? BigInt(input.projectionEpoch)
          : undefined,
      embeddingVersion: input.embeddingVersion,
      rankerProfileVersion: input.rankerProfileVersion,
      unitIdentityEpochFloor: input.unitIdentityEpochFloor,
      snapshotVersion: input.snapshotVersion,
      orderedListingIds,
      orderedUnitKeys,
      mapPayload:
        input.mapPayload === null
          ? PrismaNamespace.JsonNull
          : ((input.mapPayload ?? undefined) as Prisma.InputJsonValue | undefined),
      total: input.total ?? null,
      expiresAt: getQuerySnapshotExpiryDate(input.ttlMs),
    },
  });
}

export async function getQuerySnapshotById(
  snapshotId: string
): Promise<QuerySnapshotRecord | null> {
  return prisma.querySnapshot.findUnique({
    where: { id: snapshotId },
  });
}

export async function loadValidQuerySnapshot(
  snapshotId: string
): Promise<
  | { ok: true; snapshot: QuerySnapshotRecord }
  | { ok: false; reason: Exclude<SnapshotExpiredReason, "search_contract_changed"> }
> {
  const snapshot = await getQuerySnapshotById(snapshotId);
  if (!snapshot) {
    return { ok: false, reason: "snapshot_missing" };
  }

  if (snapshot.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "snapshot_expired" };
  }

  return { ok: true, snapshot };
}
