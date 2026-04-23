import { createHash } from "crypto";

export interface PublicCacheFloorCursor {
  id: string;
  enqueuedAt: Date | string;
}

export function buildPublicCacheFloorToken(
  latest: PublicCacheFloorCursor | null
): string {
  if (!latest) {
    return "none";
  }

  const enqueuedAtIso =
    latest.enqueuedAt instanceof Date
      ? latest.enqueuedAt.toISOString()
      : new Date(latest.enqueuedAt).toISOString();
  const idHash = createHash("sha256")
    .update(latest.id)
    .digest("hex")
    .slice(0, 12);

  return `v1:${enqueuedAtIso}:${idHash}`;
}

export function isDynamicPublicNavigationPath(pathname: string): boolean {
  return pathname === "/search" || pathname.startsWith("/listings/");
}

export function shouldBypassServiceWorkerCache(
  cacheControl: string | null | undefined
): boolean {
  if (!cacheControl) {
    return false;
  }

  const normalized = cacheControl.toLowerCase();
  return normalized.includes("no-store") || normalized.includes("private");
}
