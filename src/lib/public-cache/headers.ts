import type {
  ListingData,
  MapListingData,
} from "@/lib/search-types";
import type { SearchState } from "@/lib/search/search-response";
import { buildPublicUnitCacheKey } from "@/lib/public-cache/cache-policy";
import { currentProjectionEpoch } from "@/lib/projections/epoch";

export const PUBLIC_CACHE_HEADERS = {
  projectionEpoch: "X-Roomshare-Projection-Epoch",
  embeddingVersion: "X-Roomshare-Embedding-Version",
  unitIdentityEpoch: "X-Roomshare-Unit-Identity-Epoch",
  unitCacheKey: "X-Roomshare-Unit-Cache-Key",
  unitCacheKeys: "X-Roomshare-Unit-Cache-Keys",
  cacheFloorToken: "X-Roomshare-Cache-Floor-Token",
} as const;

export interface PublicCacheHeaderInput {
  projectionEpoch?: string | number | bigint | null;
  embeddingVersion?: string | null;
  unitIdentityEpoch?: number | null;
  unitCacheKey?: string | null;
  unitCacheKeys?: string[];
}

function parseRawGroupKey(
  groupKey: string | null | undefined
): { unitId: string; unitIdentityEpoch: number } | null {
  if (!groupKey) {
    return null;
  }

  const [unitId, epochText] = groupKey.split(":");
  const unitIdentityEpoch = Number(epochText);
  if (!unitId || !Number.isInteger(unitIdentityEpoch)) {
    return null;
  }

  return { unitId, unitIdentityEpoch };
}

export function buildPublicCacheHeaders(
  input: PublicCacheHeaderInput = {}
): Record<string, string> {
  const projectionEpoch = input.projectionEpoch ?? currentProjectionEpoch();
  const headers: Record<string, string> = {
    [PUBLIC_CACHE_HEADERS.projectionEpoch]: String(projectionEpoch),
    ETag: `W/"projection-epoch-${String(projectionEpoch)}${
      input.embeddingVersion ? `-embed-${input.embeddingVersion}` : ""
    }"`,
  };

  if (input.embeddingVersion) {
    headers[PUBLIC_CACHE_HEADERS.embeddingVersion] = input.embeddingVersion;
  }

  if (input.unitIdentityEpoch) {
    headers[PUBLIC_CACHE_HEADERS.unitIdentityEpoch] = String(
      input.unitIdentityEpoch
    );
  }

  if (input.unitCacheKey) {
    headers[PUBLIC_CACHE_HEADERS.unitCacheKey] = input.unitCacheKey;
  }

  if (input.unitCacheKeys && input.unitCacheKeys.length > 0) {
    headers[PUBLIC_CACHE_HEADERS.unitCacheKeys] = input.unitCacheKeys
      .slice(0, 50)
      .join(",");
  }

  return headers;
}

export function buildPublicCacheHeadersForSearchState(
  state: SearchState
): Record<string, string> {
  const data =
    state.kind === "ok" || state.kind === "degraded" ? state.data : null;
  const listings = data
    ? "items" in data
      ? data.items
      : data.listings
    : [];
  const unitCacheKeys = new Set<string>();

  for (const listing of listings as Array<ListingData | MapListingData>) {
    const parsed = parseRawGroupKey(listing.groupKey);
    if (!parsed) {
      continue;
    }
    unitCacheKeys.add(
      buildPublicUnitCacheKey(parsed.unitId, parsed.unitIdentityEpoch)
    );
  }

  return buildPublicCacheHeaders({
    projectionEpoch: state.meta.projectionEpoch,
    embeddingVersion: state.meta.embeddingVersion,
    unitCacheKeys: Array.from(unitCacheKeys),
  });
}

export function buildPublicCacheHeadersForListings(input: {
  listings: Array<ListingData | MapListingData>;
  projectionEpoch?: string | number | bigint | null;
  embeddingVersion?: string | null;
}): Record<string, string> {
  const unitCacheKeys = new Set<string>();

  for (const listing of input.listings) {
    const parsed = parseRawGroupKey(listing.groupKey);
    if (!parsed) {
      continue;
    }
    unitCacheKeys.add(
      buildPublicUnitCacheKey(parsed.unitId, parsed.unitIdentityEpoch)
    );
  }

  return buildPublicCacheHeaders({
    projectionEpoch: input.projectionEpoch,
    embeddingVersion: input.embeddingVersion,
    unitCacheKeys: Array.from(unitCacheKeys),
  });
}
