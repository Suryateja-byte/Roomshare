"use client";

export const PUBLIC_CACHE_INVALIDATED_EVENT = "roomshare:public-cache-invalidated";

export interface PublicCacheInvalidatedDetail {
  cacheFloorToken: string;
}

export function emitPublicCacheInvalidated(cacheFloorToken: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<PublicCacheInvalidatedDetail>(
      PUBLIC_CACHE_INVALIDATED_EVENT,
      {
        detail: { cacheFloorToken },
      }
    )
  );
}
