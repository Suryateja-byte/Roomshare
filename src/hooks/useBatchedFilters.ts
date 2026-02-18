"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSearchTransitionSafe } from "@/contexts/SearchTransitionContext";
import { useRouter } from "next/navigation";
import {
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_LEASE_DURATIONS,
  VALID_ROOM_TYPES,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  LEASE_DURATION_ALIASES,
  ROOM_TYPE_ALIASES,
  getPriceParam,
} from "@/lib/search-params";
import { normalizeLanguages } from "@/lib/languages";

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

// --- URL parsing helpers (matching SearchForm's logic) ---

function parseParamList(
  searchParams: URLSearchParams,
  key: string,
): string[] {
  const values = searchParams.getAll(key);
  if (values.length === 0) return [];
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeByAllowlist(
  values: string[],
  allowlist: readonly string[],
): string[] {
  const allowMap = new Map(
    allowlist.map((item) => [item.toLowerCase(), item]),
  );
  const normalized = values
    .map((value) => allowMap.get(value.toLowerCase()))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(normalized));
}

function parseEnumParam(
  searchParams: URLSearchParams,
  key: string,
  allowlist: readonly string[],
  aliases?: Record<string, string>,
): string {
  const value = searchParams.get(key);
  if (!value) return "";
  const trimmed = value.trim();
  if (allowlist.includes(trimmed)) return trimmed;
  const lowerValue = trimmed.toLowerCase();
  const caseMatch = allowlist.find(
    (item) => item.toLowerCase() === lowerValue,
  );
  if (caseMatch) return caseMatch;
  if (aliases) {
    const aliasMatch = aliases[lowerValue];
    if (aliasMatch && allowlist.includes(aliasMatch)) return aliasMatch;
  }
  return "";
}

/**
 * Read all filter values from URL search params.
 * Does NOT validate moveInDate against current date (that requires Date() which
 * causes hydration mismatches). Callers should validate moveInDate separately
 * after mount if needed.
 */
export function readFiltersFromURL(
  searchParams: URLSearchParams,
): BatchedFilterValues {
  // Use getPriceParam to support budget aliases (minBudget/maxBudget)
  // with canonical params (minPrice/maxPrice) taking precedence
  const parsedMin = getPriceParam(searchParams, "min");
  const parsedMax = getPriceParam(searchParams, "max");
  return {
    minPrice: parsedMin !== undefined ? String(parsedMin) : "",
    maxPrice: parsedMax !== undefined ? String(parsedMax) : "",
    roomType: parseEnumParam(
      searchParams,
      "roomType",
      VALID_ROOM_TYPES,
      ROOM_TYPE_ALIASES,
    ),
    leaseDuration: parseEnumParam(
      searchParams,
      "leaseDuration",
      VALID_LEASE_DURATIONS,
      LEASE_DURATION_ALIASES,
    ),
    moveInDate: searchParams.get("moveInDate") || "",
    amenities: normalizeByAllowlist(
      parseParamList(searchParams, "amenities"),
      VALID_AMENITIES,
    ),
    houseRules: normalizeByAllowlist(
      parseParamList(searchParams, "houseRules"),
      VALID_HOUSE_RULES,
    ),
    languages: Array.from(
      new Set(normalizeLanguages(parseParamList(searchParams, "languages"))),
    ),
    genderPreference: parseEnumParam(
      searchParams,
      "genderPreference",
      VALID_GENDER_PREFERENCES,
    ),
    householdGender: parseEnumParam(
      searchParams,
      "householdGender",
      VALID_HOUSEHOLD_GENDERS,
    ),
  };
}

// --- Dirty comparison ---

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}

function filtersEqual(
  a: BatchedFilterValues,
  b: BatchedFilterValues,
): boolean {
  return (
    a.minPrice === b.minPrice &&
    a.maxPrice === b.maxPrice &&
    a.roomType === b.roomType &&
    a.leaseDuration === b.leaseDuration &&
    a.moveInDate === b.moveInDate &&
    arraysEqual(a.amenities, b.amenities) &&
    arraysEqual(a.houseRules, b.houseRules) &&
    arraysEqual(a.languages, b.languages) &&
    a.genderPreference === b.genderPreference &&
    a.householdGender === b.householdGender
  );
}

// --- Hook ---

export interface UseBatchedFiltersReturn {
  /** Current pending filter values (may differ from URL) */
  pending: BatchedFilterValues;
  /** Whether pending differs from committed URL state */
  isDirty: boolean;
  /** Update one or more pending filter values */
  setPending: (
    valuesOrFn:
      | Partial<BatchedFilterValues>
      | ((prev: BatchedFilterValues) => Partial<BatchedFilterValues>),
  ) => void;
  /** Discard pending changes, restore to URL state */
  reset: () => void;
  /** Write pending state to URL and navigate */
  commit: () => void;
  /** The committed (URL) filter values */
  committed: BatchedFilterValues;
}

export function useBatchedFilters(): UseBatchedFiltersReturn {
  const searchParams = useSearchParams();
  const transitionContext = useSearchTransitionSafe();
  const router = useRouter();

  // Committed state derived from URL
  const committed = useMemo(
    () => readFiltersFromURL(searchParams),
    [searchParams],
  );

  // Pending state — initialized from URL, updated locally
  const [pending, setPendingState] = useState<BatchedFilterValues>(committed);
  const previousCommittedRef = useRef(committed);
  const forceSyncFromUrlRef = useRef(false);

  // Sync pending with URL when URL filter values change.
  // If only non-filter params change (for example map bounds), preserve unsaved edits.
  useEffect(() => {
    setPendingState((prevPending) => {
      const previousCommitted = previousCommittedRef.current;
      const committedFiltersChanged = !filtersEqual(committed, previousCommitted);
      const hasUnsavedEdits = !filtersEqual(prevPending, previousCommitted);
      const shouldPreserveDirtyEdits =
        !forceSyncFromUrlRef.current &&
        !committedFiltersChanged &&
        hasUnsavedEdits;

      if (shouldPreserveDirtyEdits) {
        return prevPending;
      }

      return committed;
    });
    previousCommittedRef.current = committed;
    forceSyncFromUrlRef.current = false;
  }, [committed]);

  const isDirty = useMemo(
    () => !filtersEqual(pending, committed),
    [pending, committed],
  );

  const setPending = useCallback(
    (
      valuesOrFn:
        | Partial<BatchedFilterValues>
        | ((prev: BatchedFilterValues) => Partial<BatchedFilterValues>),
    ) => {
      setPendingState((prev) => {
        const values =
          typeof valuesOrFn === "function" ? valuesOrFn(prev) : valuesOrFn;
        return { ...prev, ...values };
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setPendingState(committed);
  }, [committed]);

  const commit = useCallback(() => {
    // After an explicit apply action, prioritize URL state on the next sync.
    // This avoids preserving stale dirty state during back/forward transitions.
    forceSyncFromUrlRef.current = true;

    // Start from current URL to preserve non-filter params (bounds, sort, q, lat, lng, nearMatches)
    const params = new URLSearchParams(searchParams.toString());

    // Delete pagination
    params.delete("page");
    params.delete("cursor");
    params.delete("cursorStack");
    params.delete("pageNumber");

    // Delete all filter params before re-setting
    const filterKeys = [
      "minPrice",
      "maxPrice",
      "moveInDate",
      "leaseDuration",
      "roomType",
      "amenities",
      "houseRules",
      "languages",
      "genderPreference",
      "householdGender",
    ];
    for (const key of filterKeys) {
      params.delete(key);
    }

    // Set pending filter values
    if (pending.minPrice) params.set("minPrice", pending.minPrice);
    if (pending.maxPrice) params.set("maxPrice", pending.maxPrice);
    if (pending.roomType) params.set("roomType", pending.roomType);
    if (pending.leaseDuration)
      params.set("leaseDuration", pending.leaseDuration);
    if (pending.moveInDate) params.set("moveInDate", pending.moveInDate);
    if (pending.amenities.length > 0) {
      params.set("amenities", pending.amenities.join(","));
    }
    if (pending.houseRules.length > 0) {
      params.set("houseRules", pending.houseRules.join(","));
    }
    if (pending.languages.length > 0) {
      params.set("languages", pending.languages.join(","));
    }
    if (pending.genderPreference) {
      params.set("genderPreference", pending.genderPreference);
    }
    if (pending.householdGender) {
      params.set("householdGender", pending.householdGender);
    }

    const searchUrl = `/search?${params.toString()}`;

    if (transitionContext) {
      transitionContext.navigateWithTransition(searchUrl);
    } else {
      router.push(searchUrl);
    }
  }, [pending, searchParams, transitionContext, router]);

  return {
    pending,
    isDirty,
    setPending,
    reset,
    commit,
    committed,
  };
}
