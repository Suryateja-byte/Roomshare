import { createHash } from "node:crypto";
import type { GroupSummary } from "@/lib/search-types";
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
};

type GroupAggregate<T extends ListingLike> = {
  canonical: GroupedListing<T>;
  availableFromDates: Set<string>;
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
    const availableFrom = normalizeDateToIso(listing.moveInDate);
    const existing = groups.get(groupKey);

    if (!existing) {
      const availableFromDates = new Set<string>();
      if (availableFrom) {
        availableFromDates.add(availableFrom);
      }

      const canonical: GroupedListing<T> = {
        ...listing,
        groupKey,
        groupSummary: {
          groupKey,
          siblingIds: [],
          availableFromDates: sortIsoDates(availableFromDates),
          combinedOpenSlots: listing.openSlots ?? 0,
          combinedTotalSlots: listing.totalSlots,
          groupOverflow: false,
        },
      };

      canonicals.push(canonical);
      groups.set(groupKey, { canonical, availableFromDates });
      return;
    }

    existing.canonical.groupSummary.siblingIds.push(listing.id);
    if (availableFrom) {
      existing.availableFromDates.add(availableFrom);
      existing.canonical.groupSummary.availableFromDates = sortIsoDates(
        existing.availableFromDates
      );
    }
    existing.canonical.groupSummary.combinedOpenSlots += listing.openSlots ?? 0;
    existing.canonical.groupSummary.combinedTotalSlots += listing.totalSlots;

    if (typeof limit === "number" && index >= limit + lookAhead) {
      existing.canonical.groupSummary.groupOverflow = true;
      overflowCanonicalIds.add(existing.canonical.id);
    }
  });

  return { canonicals, overflowCanonicalIds };
}
