import { createHash } from "node:crypto";
import { createGroupContextPresentation } from "@/lib/search/availability-presentation";
import type {
  GroupContextPresentation,
  GroupSummary,
  GroupSummaryMember,
} from "@/lib/search-types";
import { normalizeListingTitle } from "./normalize-listing-title";

export type { GroupSummary } from "@/lib/search-types";

const DEFAULT_LOOK_AHEAD = 16;

export type ListingLike = {
  id: string;
  ownerId: string;
  normalizedAddress: string;
  priceCents: number;
  title: string;
  roomType: string | null;
  moveInDate: Date | string | null;
  availableUntil?: Date | string | null;
  openSlots?: number | null;
  totalSlots: number;
};

export type GroupedListing<T extends ListingLike> = T & {
  groupKey: string;
  groupSummary: GroupSummary;
  groupContext: GroupContextPresentation;
};

type GroupAggregate<T extends ListingLike> = {
  canonical: GroupedListing<T>;
  members: GroupSummaryMember[];
};

function normalizeDateToIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const directMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
    if (directMatch) {
      return directMatch[1];
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
}

function sortIsoDates(dates: Set<string>): string[] {
  return Array.from(dates).sort((left, right) => left.localeCompare(right));
}

function sortGroupMembers(members: GroupSummaryMember[]): GroupSummaryMember[] {
  const [canonicalMembers, siblingMembers] = members.reduce<
    [GroupSummaryMember[], GroupSummaryMember[]]
  >(
    (accumulator, member) => {
      if (member.isCanonical) {
        accumulator[0].push(member);
      } else {
        accumulator[1].push(member);
      }
      return accumulator;
    },
    [[], []]
  );

  siblingMembers.sort((left, right) => {
    if (left.availableFrom !== right.availableFrom) {
      return left.availableFrom.localeCompare(right.availableFrom);
    }

    if ((left.availableUntil ?? "") !== (right.availableUntil ?? "")) {
      return (left.availableUntil ?? "").localeCompare(right.availableUntil ?? "");
    }

    return left.listingId.localeCompare(right.listingId);
  });

  return [...canonicalMembers, ...siblingMembers];
}

function buildGroupMember(listing: ListingLike, isCanonical: boolean): GroupSummaryMember {
  const availableFrom = normalizeDateToIso(listing.moveInDate) ?? "";
  const availableUntil = normalizeDateToIso(listing.availableUntil);
  const startDate = availableFrom || undefined;
  const endDate =
    availableFrom && availableUntil && availableUntil > availableFrom
      ? availableUntil
      : undefined;

  return {
    listingId: listing.id,
    availableFrom,
    availableUntil,
    startDate,
    endDate,
    openSlots: Math.max(0, listing.openSlots ?? 0),
    totalSlots: Math.max(1, listing.totalSlots),
    isCanonical,
    roomType: listing.roomType ?? null,
  };
}

function buildGroupSummary(
  groupKey: string,
  members: GroupSummaryMember[],
  groupOverflow: boolean
): { groupSummary: GroupSummary; groupContext: GroupContextPresentation } {
  const orderedMembers = sortGroupMembers(members);
  const availableFromDates = sortIsoDates(
    new Set(
      orderedMembers
        .map((member) => member.availableFrom)
        .filter((value): value is string => value.length > 0)
    )
  );
  const combinedOpenSlots = orderedMembers.reduce(
    (total, member) => total + member.openSlots,
    0
  );
  const combinedTotalSlots = orderedMembers.reduce(
    (total, member) => total + member.totalSlots,
    0
  );

  const hasMalformedMembers = orderedMembers.some(
    (member) => member.availableFrom.length === 0
  );

  return {
    groupSummary: {
      groupKey,
      siblingIds: orderedMembers
        .filter((member) => !member.isCanonical)
        .map((member) => member.listingId),
      availableFromDates,
      combinedOpenSlots,
      combinedTotalSlots,
      groupOverflow,
      members: orderedMembers,
    },
    groupContext: createGroupContextPresentation({
      siblingCount: Math.max(orderedMembers.length - 1, 0),
      dateCount: availableFromDates.length,
      completeness:
        groupOverflow || hasMalformedMembers ? "partial" : "complete",
    }),
  };
}

export function buildGroupKey(input: {
  ownerId: string;
  normalizedAddress: string;
  priceCents: number;
  normalizedTitle: string;
  roomType: string | null | undefined;
}): string {
  const payload = [
    input.ownerId,
    input.normalizedAddress,
    String(input.priceCents),
    input.normalizedTitle,
    input.roomType ?? "",
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

export function groupListings<T extends ListingLike>(
  listings: T[],
  options?: { lookAhead?: number; limit?: number }
): { canonicals: GroupedListing<T>[]; overflowCanonicalIds: Set<string> } {
  const lookAhead = options?.lookAhead ?? DEFAULT_LOOK_AHEAD;
  const limit = options?.limit;
  const canonicals: GroupedListing<T>[] = [];
  const overflowCanonicalIds = new Set<string>();
  const groups = new Map<string, GroupAggregate<T>>();

  listings.forEach((listing, index) => {
    const groupKey = buildGroupKey({
      ownerId: listing.ownerId,
      normalizedAddress: listing.normalizedAddress,
      priceCents: listing.priceCents,
      normalizedTitle: normalizeListingTitle(listing.title),
      roomType: listing.roomType,
    });
    const existing = groups.get(groupKey);

    if (!existing) {
      const canonical: GroupedListing<T> = {
        ...listing,
        groupKey,
        ...buildGroupSummary(groupKey, [buildGroupMember(listing, true)], false),
      };

      canonicals.push(canonical);
      groups.set(groupKey, {
        canonical,
        members: [...(canonical.groupSummary.members ?? [])],
      });
      return;
    }

    existing.members.push(buildGroupMember(listing, false));
    const hasOverflow =
      typeof limit === "number" && index >= limit + lookAhead;

    if (hasOverflow) {
      overflowCanonicalIds.add(existing.canonical.id);
    }

    const nextSummary = buildGroupSummary(groupKey, existing.members, hasOverflow);
    existing.canonical.groupSummary = nextSummary.groupSummary;
    existing.canonical.groupContext = nextSummary.groupContext;
  });

  return { canonicals, overflowCanonicalIds };
}

export function attachGroupMetadataToListings<
  T extends ListingLike & {
    groupKey?: string | null;
    groupSummary?: GroupSummary | null;
    groupContext?: GroupContextPresentation | null;
  },
>(
  listings: T[],
  options?: { lookAhead?: number; limit?: number }
): T[] {
  if (listings.length === 0) {
    return listings;
  }

  const metadataById = buildGroupMetadataById(listings, options);

  return listings.map((listing) => {
    const metadata = metadataById.get(listing.id) as
      | Pick<T, "groupKey" | "groupSummary" | "groupContext">
      | undefined;
    return metadata ? { ...listing, ...metadata } : listing;
  });
}

export function buildGroupMetadataById<T extends ListingLike>(
  listings: T[],
  options?: { lookAhead?: number; limit?: number }
): Map<
  string,
  {
    groupKey: string;
    groupSummary: GroupSummary;
    groupContext: GroupContextPresentation;
  }
> {
  const metadataById = new Map<
    string,
    {
      groupKey: string;
      groupSummary: GroupSummary;
      groupContext: GroupContextPresentation;
    }
  >();

  const { canonicals } = groupListings(listings, options);

  for (const canonical of canonicals) {
    const members = canonical.groupSummary.members ?? [];
    const metadata = {
      groupKey: canonical.groupKey,
      groupSummary: canonical.groupSummary,
      groupContext: canonical.groupContext,
    };

    for (const member of members) {
      metadataById.set(member.listingId, metadata);
    }
  }

  return metadataById;
}
