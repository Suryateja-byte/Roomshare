import "server-only";

import { prisma } from "@/lib/prisma";
import {
  buildPublicCacheFloorToken,
  type PublicCacheFloorCursor,
} from "@/lib/public-cache/cache-policy";

export interface PublicCacheStatePayload {
  cacheFloorToken: string;
  generatedAt: string;
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

  return {
    cacheFloorToken: buildPublicCacheFloorToken(latest),
    generatedAt: new Date().toISOString(),
  };
}
