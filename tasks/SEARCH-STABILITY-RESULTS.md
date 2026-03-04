# Search Stability Fixes — Results

**Date:** 2026-03-03
**Commit scope:** 6 files changed, 7 bugs fixed (2 P0, 4 P1, 1 P2)

---

## Fixes Applied

### P0 — Critical

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `PersistentMapWrapper.tsx` | `mapSource` missing from `effectiveListings` memo deps — stale closure when V1 fetch completes | Added `mapSource` to deps array |
| 2 | `PersistentMapWrapper.tsx` | V2 and default return paths had no `MAX_MAP_MARKERS` cap — unbounded marker array could freeze browser | Applied `.slice(0, MAX_MAP_MARKERS)` to both paths |
| 3 | `SearchResultsLoadingWrapper.tsx` | Focus stolen from map on every pan (paramsKey included bounds) — breaks keyboard/screen-reader users | Strip 7 geographic params from `filterParamsKey`; focus only moves on filter/sort/query changes |

### P1 — Performance

| # | File | Bug | Fix |
|---|------|-----|-----|
| 4 | `useBatchedFilters.ts` | `committed` useMemo keyed on unstable `searchParams` reference — recalculated every render | Key on `searchParams.toString()` (string comparison, not reference) |
| 5 | `AppliedFilterChips.tsx` | `urlToFilterChips()` called inline with no memoization — runs on every render including map pans | Wrapped in `useMemo` keyed on `searchParamsString` |
| 6 | `CategoryBar.tsx` | 8x `new URLSearchParams` + `isCategoryActive` per render in `.map()` loop | Compute `activeCategoryIds` Set once via `useMemo`, use `.has()` in render |

### P2 — Defensive

| # | File | Bug | Fix |
|---|------|-----|-----|
| 7 | `POILayer.tsx` | `sessionStorage` read in `useState` initializer causes SSR/hydration mismatch | Defer to `useEffect` on mount; start with empty Set |

---

## Verification

- **Typecheck:** `pnpm typecheck` — PASS
- **Lint:** `pnpm lint` — 0 errors, 209 warnings (all pre-existing)
- **Unit tests:** `pnpm test` — 5535 passed, 3 failed (pre-existing in `SearchForm.test.tsx`, unrelated to changes)
- **react-hooks/exhaustive-deps:** No violations in any changed file (Fix #1 specifically resolves the `mapSource` gap)

### Pre-existing test failures (not caused by this change)

All 3 failures are in `SearchForm.test.tsx` — a file not touched by this commit:
1. `SearchForm > stale URL parameter cleanup > clearing all filters at once` — "Clear all" button not found
2. `SearchForm > stale URL parameter cleanup > clearing single-value filters > removes moveInDate when invalid`
3. Same test pattern — moveInDate validation logic unrelated to memo/focus fixes

---

## New Test Coverage

4 Playwright test files added in `tests/search-stability/`:

| File | Tests | Covers |
|------|-------|--------|
| `focus-management.anon.spec.ts` | 4 | Focus stays on map during pan; moves to heading on filter/sort/query change |
| `map-marker-cap.anon.spec.ts` | 3 | Marker count ≤ 200; no DOM limit errors; GeoJSON feature count within cap |
| `filter-state-sync.anon.spec.ts` | 4 | Chips from URL; browser back restores state; bounds change preserves filters; no chip flash |
| `poi-hydration.anon.spec.ts` | 4 | POI buttons render; toggle works; no hydration warnings; correct aria-labels |

Run: `pnpm playwright test tests/search-stability/ --project=chromium-anon`

---

## Risk Assessment

All fixes are single-file, independently revertible changes:

| Fix | Confidence | Blast radius |
|-----|-----------|--------------|
| #1 mapSource deps | 99% | Map markers only |
| #2 marker cap | 98% | Map markers only |
| #3 focus-steal | 92% | Focus management only (edge case: same-query different-location won't re-focus) |
| #4 committed memo | 97% | Filter state derivation |
| #5 chips memo | 99% | Filter chip display |
| #6 category memo | 99% | Category bar display |
| #7 POI hydration | 99% | POI toggle buttons |

---

## Rollback

Each fix can be reverted independently:
```bash
git checkout HEAD~1 -- <file>
```

No inter-file dependencies between fixes.
