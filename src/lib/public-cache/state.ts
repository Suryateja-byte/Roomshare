import "server-only";

import { prisma } from "@/lib/prisma";
import {
  buildPublicCacheFloorToken,
  type PublicCacheFloorCursor,
  signPublicCacheCursor,
} from "@/lib/public-cache/cache-policy";
import { currentProjectionEpoch } from "@/lib/projections/epoch";
import { getPublicCacheVapidPublicKey } from "@/lib/public-cache/push";

export interface PublicCacheStatePayload {
  cacheFloorToken: string;
  latestCursor: string | null;
  projectionEpochFloor: string;
  generatedAt: string;
  vapidPublicKey?: string;
}

export async function getLatestPublicCacheFloorCursor(): Promise<PublicCacheFloorCursor | null> {
  return prisma.cacheInvalidation.findFirst({
    orderBy: [{ enqueuedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      enqueuedAt: true,
    },
  });
}

export async function getPublicCacheStatePayload(): Promise<PublicCacheStatePayload> {
  const latest = await getLatestPublicCacheFloorCursor();
  const vapidPublicKey = getPublicCacheVapidPublicKey();

  return {
    cacheFloorToken: buildPublicCacheFloorToken(latest),
    latestCursor: signPublicCacheCursor(latest),
    projectionEpochFloor: String(currentProjectionEpoch()),
    generatedAt: new Date().toISOString(),
    ...(vapidPublicKey ? { vapidPublicKey } : {}),
  };
}
