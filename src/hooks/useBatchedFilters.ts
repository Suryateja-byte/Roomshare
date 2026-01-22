"use client";

/**
 * Batched filter values - represents pending filter state
 * before it's committed to the URL.
 */
export interface BatchedFilterValues {
  minPrice: string;
  maxPrice: string;
  roomType: string;
  leaseDuration: string;
  moveInDate: string;
  amenities: string[];
  houseRules: string[];
  languages: string[];
  genderPreference: string;
  householdGender: string;
}

/**
 * Default empty filter values
 */
export const emptyFilterValues: BatchedFilterValues = {
  minPrice: "",
  maxPrice: "",
  roomType: "",
  leaseDuration: "",
  moveInDate: "",
  amenities: [],
  houseRules: [],
  languages: [],
  genderPreference: "",
  householdGender: "",
};

/**
 * Hook for managing batched filter state
 * This is a stub - full implementation pending
 */
export function useBatchedFilters() {
  return {
    pending: emptyFilterValues,
    isDirty: false,
    setPending: (_values: Partial<BatchedFilterValues>) => {},
    reset: () => {},
    commit: () => {},
  };
}
