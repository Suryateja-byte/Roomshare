export interface NormalizedPriceRange {
  minPrice: number | null;
  maxPrice: number | null;
}

/**
 * Normalize a raw min/max budget pair from text inputs: drop non-finite values,
 * clamp negatives to 0, and swap when min > max. Mirrors the server-side
 * normalizeSearchFilters semantics but keeps inverted ranges (by swapping)
 * instead of dropping them.
 */
export function normalizePriceRange(
  minRaw: string,
  maxRaw: string
): NormalizedPriceRange {
  let minPrice = minRaw ? parseFloat(minRaw) : null;
  let maxPrice = maxRaw ? parseFloat(maxRaw) : null;

  if (minPrice !== null && !Number.isFinite(minPrice)) {
    minPrice = null;
  }
  if (maxPrice !== null && !Number.isFinite(maxPrice)) {
    maxPrice = null;
  }
  if (minPrice !== null && minPrice < 0) {
    minPrice = 0;
  }
  if (maxPrice !== null && maxPrice < 0) {
    maxPrice = 0;
  }
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }

  return { minPrice, maxPrice };
}
