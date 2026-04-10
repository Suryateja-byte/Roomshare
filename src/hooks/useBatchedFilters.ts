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
import {
  applySearchQueryChange,
  buildCanonicalSearchUrl,
  normalizeSearchQuery,
} from "@/lib/search/search-query";

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
  minSlots: string;
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
  minSlots: "",
};

// --- URL parsing helpers (matching SearchForm's logic) ---

function parseParamList(searchParams: URLSearchParams, key: string): string[] {
  const values = searchParams.getAll(key);
  if (values.length === 0) return [];
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeByAllowlist(
  values: string[],
  allowlist: readonly string[]
): string[] {
  const allowMap = new Map(allowlist.map((item) => [item.toLowerCase(), item]));
  const normalized = values
    .map((value) => allowMap.get(value.toLowerCase()))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(normalized));
}

function parseEnumParam(
  searchParams: URLSearchParams,
  key: string,
  allowlist: readonly string[],
  aliases?: Record<string, string>
): string {
  const value = searchParams.get(key);
  if (!value) return "";
  const trimmed = value.trim();
  if (allowlist.includes(trimmed)) return trimmed;
  const lowerValue = trimmed.toLowerCase();
  const caseMatch = allowlist.find((item) => item.toLowerCase() === lowerValue);
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
  searchParams: URLSearchParams
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
      ROOM_TYPE_ALIASES
    ),
    leaseDuration: parseEnumParam(
      searchParams,
      "leaseDuration",
      VALID_LEASE_DURATIONS,
      LEASE_DURATION_ALIASES
    ),
    moveInDate: searchParams.get("moveInDate") || "",
    amenities: normalizeByAllowlist(
      parseParamList(searchParams, "amenities"),
      VALID_AMENITIES
    ),
    houseRules: normalizeByAllowlist(
      parseParamList(searchParams, "houseRules"),
      VALID_HOUSE_RULES
    ),
    languages: Array.from(
      new Set(normalizeLanguages(parseParamList(searchParams, "languages")))
    ),
    genderPreference: parseEnumParam(
      searchParams,
      "genderPreference",
      VALID_GENDER_PREFERENCES
    ),
    householdGender: parseEnumParam(
      searchParams,
      "householdGender",
      VALID_HOUSEHOLD_GENDERS
    ),
    minSlots: (() => {
      const raw = searchParams.get("minSlots");
      if (!raw) return "";
      const parsed = parseInt(raw.trim(), 10);
      return Number.isFinite(parsed) && parsed >= 1 && parsed <= 20
        ? String(parsed)
        : "";
    })(),
  };
}

// --- Dirty comparison ---

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}

function filtersEqual(a: BatchedFilterValues, b: BatchedFilterValues): boolean {
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
    a.householdGender === b.householdGender &&
    a.minSlots === b.minSlots
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
      | ((prev: BatchedFilterValues) => Partial<BatchedFilterValues>)
  ) => void;
  /** Discard pending changes, restore to URL state */
  reset: () => void;
  /** Write pending state to URL and navigate, with optional immediate overrides */
  commit: (overrides?: Partial<BatchedFilterValues>) => void;
  /** The committed (URL) filter values */
  committed: BatchedFilterValues;
}

interface UseBatchedFiltersOptions {
  isDrawerOpen?: boolean;
}

export function useBatchedFilters(
  options: UseBatchedFiltersOptions = {}
): UseBatchedFiltersReturn {
  const { isDrawerOpen = false } = options;
  const searchParams = useSearchParams();
  const transitionContext = useSearchTransitionSafe();
  const router = useRouter();

  // Committed state derived from URL (keyed on string value, not object reference)
  const searchParamsString = searchParams.toString();
  const committed = useMemo(
    () => readFiltersFromURL(new URLSearchParams(searchParamsString)),
    [searchParamsString]
  );

  // Pending state — initialized from URL, updated locally
  const [pending, setPendingState] = useState<BatchedFilterValues>(committed);
  const previousCommittedRef = useRef(committed);
  const forceSyncUntilRef = useRef(0);
  const prevDrawerOpenRef = useRef(false);

  // Sync pending with URL when URL filter values change.
  // If only non-filter params change (for example map bounds), preserve unsaved edits.
  useEffect(() => {
    const drawerJustOpened = isDrawerOpen && !prevDrawerOpenRef.current;
    prevDrawerOpenRef.current = isDrawerOpen;

    if (drawerJustOpened) {
      // Merge committed URL state with any user-edited pending fields.
      // Without this merge, opening the drawer would wipe inline edits
      // (e.g. price typed into the search bar) because committed state
      // reflects the URL which hasn't been updated yet.
      setPendingState((prevPending) => {
        const prevCommitted = previousCommittedRef.current;
        const merged: BatchedFilterValues = { ...committed };
        const scalarKeys = [
          "minPrice",
          "maxPrice",
          "roomType",
          "leaseDuration",
          "moveInDate",
          "genderPreference",
          "householdGender",
          "minSlots",
        ] as const;
        for (const key of scalarKeys) {
          if (prevPending[key] !== prevCommitted[key]) {
            merged[key] = prevPending[key];
          }
        }
        const arrayKeys = ["amenities", "houseRules", "languages"] as const;
        for (const key of arrayKeys) {
          if (!arraysEqual(prevPending[key], prevCommitted[key])) {
            merged[key] = [...prevPending[key]];
          }
        }
        return merged;
      });
      previousCommittedRef.current = committed;
      return;
    }

    setPendingState((prevPending) => {
      const previousCommitted = previousCommittedRef.current;
      const committedFiltersChanged = !filtersEqual(
        committed,
        previousCommitted
      );
      const hasUnsavedEdits = !filtersEqual(prevPending, previousCommitted);
      const isPostCommitSyncActive = Date.now() < forceSyncUntilRef.current;

      // Guard: when the drawer is open and user has dirty edits,
      // don't overwrite with force-sync — preserve the user's in-progress changes.
      // STABILIZATION FIX: Added !committedFiltersChanged so that back/forward
      // navigation (which changes committed filters) always syncs pending to URL,
      // even within the forceSyncUntil window. Without this, pressing Back within
      // 10s of committing filters while the drawer is open shows stale values.
      if (
        isPostCommitSyncActive &&
        isDrawerOpen &&
        hasUnsavedEdits &&
        !committedFiltersChanged
      ) {
        return prevPending;
      }

      const shouldPreserveDirtyEdits =
        !isPostCommitSyncActive && !committedFiltersChanged && hasUnsavedEdits;

      if (shouldPreserveDirtyEdits) {
        return prevPending;
      }

      return committed;
    });
    previousCommittedRef.current = committed;
  }, [committed, isDrawerOpen]);

  // N1 FIX: Clear expired moveInDate after hydration.
  // readFiltersFromURL() intentionally skips date validation (causes hydration mismatch).
  // Server's safeParseDate rejects past dates, so UI would show an expired date as active
  // while results are unfiltered. This effect syncs the client to match server behavior.
  const hasRunDateCleanup = useRef(false);
  useEffect(() => {
    if (hasRunDateCleanup.current) return;
    hasRunDateCleanup.current = true;
    setPendingState((prev) => {
      if (!prev.moveInDate) return prev;
      const d = new Date(prev.moveInDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(d.getTime()) || d < today) {
        return { ...prev, moveInDate: "" };
      }
      return prev;
    });
  }, []);

  // F5 FIX: Suppress isDirty during active transitions to prevent flash of "pending changes" banner.
  // During the window between commit() and URL update, pending != committed but the transition is in progress.
  const isDirty = useMemo(
    () => !filtersEqual(pending, committed) && !transitionContext?.isPending,
    [pending, committed, transitionContext?.isPending]
  );

  const setPending = useCallback(
    (
      valuesOrFn:
        | Partial<BatchedFilterValues>
        | ((prev: BatchedFilterValues) => Partial<BatchedFilterValues>)
    ) => {
      setPendingState((prev) => {
        const values =
          typeof valuesOrFn === "function" ? valuesOrFn(prev) : valuesOrFn;
        return { ...prev, ...values };
      });
    },
    []
  );

  const reset = useCallback(() => {
    setPendingState(committed);
  }, [committed]);

  const commit = useCallback((overrides?: Partial<BatchedFilterValues>) => {
    // After an explicit apply action, prioritize URL state for a short window.
    // This avoids preserving stale dirty state during immediate back/forward transitions.
    // 10s covers typical back/forward navigation latency with margin.
    const FORCE_SYNC_WINDOW_MS = 10_000;
    forceSyncUntilRef.current = Date.now() + FORCE_SYNC_WINDOW_MS;
    const nextPending = overrides ? { ...pending, ...overrides } : pending;
    const nextMinPrice = nextPending.minPrice
      ? Number.parseFloat(nextPending.minPrice)
      : undefined;
    const nextMaxPrice = nextPending.maxPrice
      ? Number.parseFloat(nextPending.maxPrice)
      : undefined;
    const parsedMinSlots = nextPending.minSlots
      ? parseInt(nextPending.minSlots, 10)
      : NaN;

    if (overrides) {
      setPendingState(nextPending);
    }

    const currentQuery = normalizeSearchQuery(
      new URLSearchParams(searchParams.toString())
    );
    const searchUrl = buildCanonicalSearchUrl(
      applySearchQueryChange(currentQuery, "filter", {
        minPrice: Number.isFinite(nextMinPrice) ? nextMinPrice : undefined,
        maxPrice: Number.isFinite(nextMaxPrice) ? nextMaxPrice : undefined,
        roomType: nextPending.roomType || undefined,
        leaseDuration: nextPending.leaseDuration || undefined,
        moveInDate: nextPending.moveInDate || undefined,
        amenities:
          nextPending.amenities.length > 0 ? nextPending.amenities : undefined,
        houseRules:
          nextPending.houseRules.length > 0
            ? nextPending.houseRules
            : undefined,
        languages:
          nextPending.languages.length > 0 ? nextPending.languages : undefined,
        genderPreference: nextPending.genderPreference || undefined,
        householdGender: nextPending.householdGender || undefined,
        minSlots:
          Number.isFinite(parsedMinSlots) && parsedMinSlots >= 2
            ? parsedMinSlots
            : undefined,
      })
    );

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
