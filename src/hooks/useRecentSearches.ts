"use client";

/**
 * useRecentSearches - Hook for managing recent search history
 *
 * Features:
 * - Stores recent searches with full filter state
 * - Migrates old format (location-only) to new format (with filters)
 * - Formats searches for display: "Austin · $500-1000 · Wifi, Parking"
 * - Manages localStorage with error handling
 * - Max 5 entries, deduped by location
 */

import { useState, useEffect, useCallback } from "react";

// Storage key and limits
const RECENT_SEARCHES_KEY = "roomshare-recent-searches";
const MAX_RECENT_SEARCHES = 5;

/**
 * Filter state stored with each recent search
 */
export interface RecentSearchFilters {
  minPrice?: string;
  maxPrice?: string;
  roomType?: string;
  amenities?: string[];
  leaseDuration?: string;
  houseRules?: string[];
}

/**
 * Enhanced recent search structure with full filter state
 */
export interface RecentSearch {
  /** Unique identifier for React keys */
  id: string;
  /** Display location (e.g., "Austin, TX") */
  location: string;
  /** Optional geocoded coordinates */
  coords?: { lat: number; lng: number };
  /** When the search was saved */
  timestamp: number;
  /** Applied filters at time of search */
  filters: RecentSearchFilters;
  /** Optional result count when search was saved */
  resultCount?: number;
}

/**
 * Legacy format for migration (pre-P2-11)
 */
interface LegacyRecentSearch {
  location: string;
  coords?: { lat: number; lng: number };
  timestamp: number;
}

/**
 * Generate a simple unique ID for React keys
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Check if a search entry is in the legacy format
 */
function isLegacyFormat(
  search: RecentSearch | LegacyRecentSearch,
): search is LegacyRecentSearch {
  return !("id" in search) || !("filters" in search);
}

/**
 * Migrate a legacy search entry to the new format
 */
function migrateLegacySearch(legacy: LegacyRecentSearch): RecentSearch {
  return {
    id: generateId(),
    location: legacy.location,
    coords: legacy.coords,
    timestamp: legacy.timestamp,
    filters: {}, // Empty filters for migrated entries
  };
}

/**
 * Format a recent search for display
 * Example: "Austin, TX · $500-1000 · Wifi, Parking"
 */
export function formatRecentSearch(search: RecentSearch): string {
  const parts: string[] = [search.location];

  // Add price range if present
  if (search.filters.minPrice || search.filters.maxPrice) {
    const min = search.filters.minPrice || "0";
    const max = search.filters.maxPrice || "∞";
    parts.push(`$${min}-${max}`);
  }

  // Add room type if present
  if (search.filters.roomType) {
    parts.push(search.filters.roomType);
  }

  // Add first 2 amenities if present
  if (search.filters.amenities?.length) {
    const amenityDisplay = search.filters.amenities.slice(0, 2).join(", ");
    if (search.filters.amenities.length > 2) {
      parts.push(`${amenityDisplay} +${search.filters.amenities.length - 2}`);
    } else {
      parts.push(amenityDisplay);
    }
  }

  return parts.join(" · ");
}

/**
 * Get a short summary of applied filters
 */
export function getFilterSummary(filters: RecentSearchFilters): string | null {
  const summaryParts: string[] = [];

  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice || "0";
    const max = filters.maxPrice || "∞";
    summaryParts.push(`$${min}-${max}`);
  }

  if (filters.roomType) {
    summaryParts.push(filters.roomType);
  }

  if (filters.leaseDuration) {
    summaryParts.push(filters.leaseDuration);
  }

  const amenityCount = filters.amenities?.length || 0;
  const ruleCount = filters.houseRules?.length || 0;
  const totalFilters = amenityCount + ruleCount;

  if (totalFilters > 0) {
    summaryParts.push(`${totalFilters} filter${totalFilters > 1 ? "s" : ""}`);
  }

  return summaryParts.length > 0 ? summaryParts.join(" · ") : null;
}

/**
 * Hook for managing recent search history
 *
 * @returns Object with recent searches state and management functions
 */
export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load and migrate recent searches from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as (
          | RecentSearch
          | LegacyRecentSearch
        )[];

        // Migrate any legacy entries to new format
        const migrated: RecentSearch[] = parsed.map((entry) =>
          isLegacyFormat(entry) ? migrateLegacySearch(entry) : entry,
        );

        setRecentSearches(migrated);

        // If any entries were migrated, save back the updated format
        const hadLegacy = parsed.some(isLegacyFormat);
        if (hadLegacy) {
          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(migrated));
        }
      }
    } catch {
      // Ignore localStorage errors (private browsing, quota exceeded, etc.)
    }
    setIsLoaded(true);
  }, []);

  /**
   * Save a new search to recent searches
   *
   * @param location - Display location text
   * @param coords - Optional geocoded coordinates
   * @param filters - Applied filters at time of search
   * @param resultCount - Optional result count
   */
  const saveRecentSearch = useCallback(
    (
      location: string,
      coords?: { lat: number; lng: number },
      filters: RecentSearchFilters = {},
      resultCount?: number,
    ) => {
      const trimmedLocation = location.trim();
      if (!trimmedLocation) return;

      const newSearch: RecentSearch = {
        id: generateId(),
        location: trimmedLocation,
        coords,
        timestamp: Date.now(),
        filters,
        resultCount,
      };

      setRecentSearches((prev) => {
        // Remove duplicates by location (case-insensitive)
        const filtered = prev.filter(
          (s) => s.location.toLowerCase() !== trimmedLocation.toLowerCase(),
        );

        // Add new search at the beginning, limit to max
        const updated = [newSearch, ...filtered].slice(0, MAX_RECENT_SEARCHES);

        // Persist to localStorage
        try {
          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        } catch {
          // Ignore localStorage errors
        }

        return updated;
      });
    },
    [],
  );

  /**
   * Clear all recent searches
   */
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  /**
   * Remove a specific recent search by ID
   *
   * @param id - ID of the search to remove
   */
  const removeRecentSearch = useCallback((id: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s.id !== id);

      try {
        if (updated.length > 0) {
          localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
        } else {
          localStorage.removeItem(RECENT_SEARCHES_KEY);
        }
      } catch {
        // Ignore localStorage errors
      }

      return updated;
    });
  }, []);

  return {
    /** List of recent searches (newest first) */
    recentSearches,
    /** Whether searches have been loaded from localStorage */
    isLoaded,
    /** Save a new search with optional filters and result count */
    saveRecentSearch,
    /** Clear all recent searches */
    clearRecentSearches,
    /** Remove a specific search by ID */
    removeRecentSearch,
    /** Format a search for display */
    formatSearch: formatRecentSearch,
    /** Get a short filter summary */
    getFilterSummary,
  };
}
