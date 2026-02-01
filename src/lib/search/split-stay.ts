import type { ListingData } from '@/lib/data';

export interface SplitStayPair {
  first: ListingData;
  second: ListingData;
  /** Total combined price for the full stay */
  combinedPrice: number;
  /** Label like "2 weeks + 2 weeks" */
  splitLabel: string;
}

/**
 * findSplitStays — Find complementary listing pairs for long stays.
 *
 * For trips >7 days where no single listing covers all dates,
 * this finds pairs of listings that together can cover the full duration.
 *
 * V1: Stub — returns empty array. Requires date-aware availability
 * data not yet in the schema.
 */
export function findSplitStays(
  listings: ListingData[],
  stayMonths?: number,
): SplitStayPair[] {
  // Only suggest split stays for 6+ month durations with enough listings
  if (!stayMonths || stayMonths < 6 || listings.length < 2) return [];

  const halfMonths = Math.floor(stayMonths / 2);
  const remainderMonths = stayMonths - halfMonths;
  const splitLabel = `${halfMonths} mo + ${remainderMonths} mo`;

  // Sort by price to pair budget-friendly with premium options
  const sorted = [...listings]
    .filter((l) => l.price > 0)
    .sort((a, b) => a.price - b.price);

  if (sorted.length < 2) return [];

  const pairs: SplitStayPair[] = [];
  const maxPairs = Math.min(2, Math.floor(sorted.length / 2));

  for (let i = 0; i < maxPairs; i++) {
    const first = sorted[i];
    const second = sorted[sorted.length - 1 - i];
    if (first.id === second.id) continue;

    pairs.push({
      first,
      second,
      combinedPrice: first.price * halfMonths + second.price * remainderMonths,
      splitLabel,
    });
  }

  return pairs;
}
