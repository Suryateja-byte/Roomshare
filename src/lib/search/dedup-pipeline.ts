import { groupListings, type ListingLike } from "@/lib/search/dedup";
import { normalizeAddress } from "@/lib/search/normalize-address";
import type { GroupContextPresentation, GroupSummary } from "@/lib/search-types";

export type SearchRowForDedup = {
  id: string;
  ownerId: string;
  title: string;
  price: number;
  roomType: string | null;
  moveInDate: Date | string | null;
  availableUntil: Date | string | null;
  openSlots: number | null;
  totalSlots: number;
  normalizedAddress: string | null;
  location: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  } | null;
};

type CanonicalSearchRow = SearchRowForDedup & {
  groupKey: string;
  groupSummary: GroupSummary;
  groupContext: GroupContextPresentation;
};

type SearchDedupWorkingRow = ListingLike & {
  sourceRow: SearchRowForDedup;
};

function getEffectiveNormalizedAddress(row: SearchRowForDedup): string {
  if (row.normalizedAddress) {
    return row.normalizedAddress;
  }

  return normalizeAddress(
    row.location ?? {
      address: null,
      city: null,
      state: null,
      zip: null,
    }
  );
}

export function applyServerDedup(
  rows: SearchRowForDedup[],
  opts: { enabled: boolean; limit: number; lookAhead?: number }
): {
  canonicals: Array<
    SearchRowForDedup & {
      groupKey: string;
      groupSummary: GroupSummary;
      groupContext: GroupContextPresentation;
    }
  >;
  overflowCanonicalIds: Set<string>;
  metrics: {
    rowsIn: number;
    groupsOut: number;
    maxGroupSize: number;
    overflowCount: number;
  };
} {
  if (!opts.enabled) {
    return {
      canonicals: rows.map((row) => row) as CanonicalSearchRow[],
      overflowCanonicalIds: new Set<string>(),
      metrics: {
        rowsIn: rows.length,
        groupsOut: rows.length,
        maxGroupSize: rows.length > 0 ? 1 : 0,
        overflowCount: 0,
      },
    };
  }

  const workingRows: SearchDedupWorkingRow[] = rows.map((row) => ({
    id: row.id,
    ownerId: row.ownerId,
    normalizedAddress: getEffectiveNormalizedAddress(row),
    priceCents: Math.round(row.price * 100),
    title: row.title,
    roomType: row.roomType,
    moveInDate: row.moveInDate,
    availableUntil: row.availableUntil,
    openSlots: row.openSlots,
    totalSlots: row.totalSlots,
    sourceRow: row,
  }));

  const { canonicals: groupedCanonicals, overflowCanonicalIds } = groupListings(
    workingRows,
    {
      limit: opts.limit,
      lookAhead: opts.lookAhead,
    }
  );

  const canonicals = groupedCanonicals.map(
    ({ sourceRow, groupKey, groupSummary, groupContext }) => ({
      ...sourceRow,
      groupKey,
      groupSummary,
      groupContext,
    })
  );

  const maxGroupSize = canonicals.reduce((max, canonical) => {
    return Math.max(max, 1 + canonical.groupSummary.siblingIds.length);
  }, 0);

  return {
    canonicals,
    overflowCanonicalIds,
    metrics: {
      rowsIn: rows.length,
      groupsOut: canonicals.length,
      maxGroupSize,
      overflowCount: overflowCanonicalIds.size,
    },
  };
}
