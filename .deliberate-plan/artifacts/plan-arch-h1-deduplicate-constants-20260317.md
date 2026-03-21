# Plan: ARCH-H1 — Deduplicate Filter/Validation Constants

**Task Type**: REFACTOR
**Confidence Score**: 4.7 / 5.0 (HIGH — execute with standard review)
**Date**: 2026-03-17

---

## Executive Summary

Nine filter/validation constants are defined identically in both `src/lib/filter-schema.ts` (lines 35–126) and `src/lib/search-params.ts` (lines 236–313). Neither file imports these constants from the other — they are copy-pasted duplicates. This creates a drift risk where one file is updated but the other is not.

**Fix**: Delete the 9 duplicate constants from `search-params.ts` and replace them with re-exports from `filter-schema.ts`. Two consumer files that import these constants from `search-params` will continue to work because re-exports are transparent to importers.

**ARCH-H2 note**: `assertParameterizedWhereClause` deduplication is covered by SEC-H4 (security team). Not planned here.

---

## Confidence Score Breakdown

| Dimension | Weight | Score | Rationale |
|-----------|--------|-------|-----------|
| Research Grounding | 15% | 5 | Standard TS re-export pattern, no novel techniques |
| Codebase Accuracy | 25% | 5 | Every file path, import line, constant name verified via grep |
| Assumption Freedom | 20% | 5 | Zero assumptions — all import sites enumerated |
| Completeness | 15% | 4 | All steps present; rollback is trivial (git revert) |
| Harsh Critic Verdict | 15% | 4 | One minor risk (SortOption type duplication) addressed |
| Specificity | 10% | 5 | Every file, line, and import path specified |

**Overall**: 4.7 → **HIGH** — Execute with standard review

---

## Import Graph Analysis (Verified)

### Current State

```
constants.ts ←── filter-schema.ts ←── search-params.ts (imports VALID_BOOKING_MODES only)
                       ↑                        ↑
                       |                        |
              [importers A]            [importers B]
```

**Importers of constants FROM `filter-schema.ts`** (Group A):
1. `src/lib/schemas.ts` — VALID_ROOM_TYPES, VALID_LEASE_DURATIONS, VALID_GENDER_PREFERENCES, VALID_HOUSEHOLD_GENDERS, VALID_AMENITIES, VALID_HOUSE_RULES
2. `src/components/filters/filter-chip-utils.ts` — LEASE_DURATION_ALIASES, ROOM_TYPE_ALIASES, VALID_LEASE_DURATIONS, VALID_AMENITIES, VALID_HOUSE_RULES, VALID_ROOM_TYPES
3. `src/app/api/listings/[id]/route.ts` — VALID_AMENITIES, VALID_HOUSE_RULES
4. `src/__tests__/lib/filter-schema.test.ts` — all 9 constants
5. `src/__tests__/property/filter-properties.test.ts` — VALID_AMENITIES, VALID_HOUSE_RULES, VALID_ROOM_TYPES, VALID_SORT_OPTIONS
6. `src/__tests__/fixtures/listings.fixture.ts` — types only (Amenity, HouseRule, RoomType, SortOption)

**Importers of constants FROM `search-params.ts`** (Group B — AFFECTED by this change):
1. `src/hooks/useBatchedFilters.ts` — VALID_AMENITIES, VALID_HOUSE_RULES, VALID_LEASE_DURATIONS, VALID_ROOM_TYPES, VALID_GENDER_PREFERENCES, VALID_HOUSEHOLD_GENDERS, LEASE_DURATION_ALIASES, ROOM_TYPE_ALIASES
2. `src/components/SearchForm.tsx` — VALID_AMENITIES, VALID_HOUSE_RULES

**No file imports the same constant from BOTH modules** — clean separation.

### After Fix

```
constants.ts ←── filter-schema.ts ←── search-params.ts (imports VALID_BOOKING_MODES + re-exports 9 constants)
                       ↑                        ↑
                       |                        |
              [importers A]            [importers B — unchanged, re-exports are transparent]
```

### Circular Dependency Check: **SAFE**

- `filter-schema.ts` imports from: `zod`, `./languages`, `./constants` — **NOT from search-params.ts**
- `search-params.ts` imports from: `./languages`, `./constants`, `./filter-schema` (VALID_BOOKING_MODES)
- Direction is **one-way**: search-params → filter-schema. No cycle.
- Adding 9 more imports from filter-schema to search-params does NOT create a cycle (same direction).

---

## Implementation Steps

### Step 1: Modify `src/lib/search-params.ts` — Delete duplicates, add re-exports

**What to do**: Remove lines 236–313 (9 constant definitions + `validSortOptions` array) and replace with imports + re-exports from `filter-schema.ts`.

**Before** (lines 9, 236–321):
```ts
// Line 9:
import { VALID_BOOKING_MODES } from "./filter-schema";

// Lines 236-313: (DUPLICATE DEFINITIONS)
export const VALID_AMENITIES = [...] as const;
export const VALID_HOUSE_RULES = [...] as const;
export const VALID_LEASE_DURATIONS = [...] as const;
export const LEASE_DURATION_ALIASES: Record<string, string> = {...};
export const VALID_ROOM_TYPES = [...] as const;
export const ROOM_TYPE_ALIASES: Record<string, string> = {...};
export const VALID_GENDER_PREFERENCES = [...] as const;
export const VALID_HOUSEHOLD_GENDERS = [...] as const;
export const VALID_SORT_OPTIONS = [...] as const;

// Lines 315-321: (ALSO DUPLICATE — validSortOptions local array)
const validSortOptions: SortOption[] = [
  "recommended", "price_asc", "price_desc", "newest", "rating",
];
```

**After**:
```ts
// Line 9 — expand the existing import:
import {
  VALID_BOOKING_MODES,
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_LEASE_DURATIONS,
  LEASE_DURATION_ALIASES,
  VALID_ROOM_TYPES,
  ROOM_TYPE_ALIASES,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  VALID_SORT_OPTIONS,
} from "./filter-schema";

// Re-export for consumers that import from search-params
export {
  VALID_AMENITIES,
  VALID_HOUSE_RULES,
  VALID_LEASE_DURATIONS,
  LEASE_DURATION_ALIASES,
  VALID_ROOM_TYPES,
  ROOM_TYPE_ALIASES,
  VALID_GENDER_PREFERENCES,
  VALID_HOUSEHOLD_GENDERS,
  VALID_SORT_OPTIONS,
};

// Replace the local validSortOptions array with a reference to VALID_SORT_OPTIONS:
const validSortOptions: SortOption[] = [...VALID_SORT_OPTIONS];
```

**Lines to delete**: 236–321 (86 lines of duplicate definitions)
**Lines to add**: ~20 lines (import expansion + re-export block + validSortOptions reference)

### Step 2: Fix `SortOption` type duplication

`search-params.ts` defines its own `SortOption` type (line 14–19) which duplicates the one in `filter-schema.ts` (line 139). However, `FilterParams` interface in `search-params.ts` (line 21) uses this local type, and 30+ files import `FilterParams` from `search-params`.

**Decision**: Do NOT remove the `SortOption` type from `search-params.ts` in this PR. It would require changing the `FilterParams` interface and propagating to 30+ files — scope creep. The type values are identical and will stay in sync because `VALID_SORT_OPTIONS` is now single-sourced.

**Note for future**: A follow-up ticket should consolidate the `FilterParams` type (search-params.ts has a looser `string`-based version; filter-schema.ts has a strict Zod-inferred version).

### Step 3: Verify — no code changes needed in consumers

These files import the 9 constants from `search-params` and will continue to work because re-exports are transparent:
- `src/hooks/useBatchedFilters.ts` (line 7–17) — **no change needed**
- `src/components/SearchForm.tsx` (line 15–18) — **no change needed**

### Step 4: Run verification

```bash
# 1. TypeScript type check (catches any broken imports)
pnpm typecheck

# 2. Run filter-schema tests (source of truth)
pnpm test -- --testPathPattern="filter-schema"

# 3. Run search-params tests (consumer)
pnpm test -- --testPathPattern="search-params"

# 4. Run property tests (use constants)
pnpm test -- --testPathPattern="filter-properties"

# 5. Run full test suite
pnpm test

# 6. Lint check
pnpm lint
```

---

## Files Changed (Complete List)

| File | Action | Lines Changed |
|------|--------|---------------|
| `src/lib/search-params.ts` | MODIFY | Delete lines 236–321, expand import on line 9, add re-export block |

**Total files changed: 1**
**Total files NOT changed: All consumers (re-exports are transparent)**

---

## Test Strategy

### Existing Coverage (Sufficient)

1. **`src/__tests__/lib/filter-schema.test.ts`** — Tests all 9 constants via `normalizeFilters()` — verifies source of truth unchanged
2. **`src/__tests__/lib/search-params.test.ts`** — Tests `parseSearchParams()` and `validateSearchFilters()` which use the constants internally — verifies consumers still work
3. **`src/__tests__/property/filter-properties.test.ts`** — Property-based tests for filter invariants — catches any behavioral regression
4. **`src/__tests__/performance/filter-performance.test.ts`** — Performance benchmarks — ensures no degradation from import indirection

### No New Tests Needed

The existing test suite is comprehensive. The change is purely structural (import source change), not behavioral. If all existing tests pass + typecheck passes, the refactor is correct.

---

## Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Consumer breaks from import change | LOW | VERY LOW | Re-exports are transparent; TypeScript compiler catches all |
| Circular dependency | NONE | ZERO | Verified: filter-schema does NOT import from search-params |
| Behavioral divergence | NONE | ZERO | Single source of truth eliminates this risk |
| Type mismatch (SortOption) | LOW | LOW | Deferred to follow-up; values are identical |

---

## Rollback Plan

**Difficulty**: Trivial
**Method**: `git revert <commit-sha>`
**Risk**: Zero — restoring duplicate constants is safe and has no data implications

---

## Pre-Mortem Analysis

**"The plan was executed and failed. What went wrong?"**

| Failure Mode | Probability | Prevention |
|-------------|-------------|------------|
| Forgot to re-export a constant | VERY LOW | The plan enumerates all 9; typecheck would catch any missing export |
| validSortOptions breaks | LOW | Replaced with `[...VALID_SORT_OPTIONS]` spread — same runtime array |
| Bundle size regression | ZERO | Re-exports are tree-shaken by Next.js/webpack |
| Runtime import order issue | ZERO | One-directional dependency; no side effects in constant definitions |

---

## Harsh Critic Report

**Verdict**: PASS

- No blockers (zero 🔴)
- One minor note: SortOption type duplication not addressed — accepted as deferred scope (🟡)
- The `validSortOptions` local array (lines 315–321) duplicates `VALID_SORT_OPTIONS` — plan correctly replaces it with a spread reference
- All import sites verified by grep, not assumed

---

## Open Questions

None. All facts verified against codebase.

---

## Dependencies

- **ARCH-H2** (assertParameterizedWhereClause deduplication) is handled by SEC-H4 / security team. No dependency between ARCH-H1 and ARCH-H2.
