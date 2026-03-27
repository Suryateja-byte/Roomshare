# Search Page Production Hardening Plan

**Task**: Fix 8 identified stability issues to make search page production-ready
**Type**: FIX
**Date**: 2026-03-21
**Confidence Score**: 4.6/5 (HIGH)

| Dimension | Weight | Score |
|-----------|--------|-------|
| Research Grounding | 15% | 5 — Existing circuit breaker pattern in codebase, no external research needed |
| Codebase Accuracy | 25% | 5 — Every file path, line number, and function verified by direct read |
| Assumption Freedom | 20% | 4 — Cursor NaN risk is theoretical (HMAC protects); included as defense-in-depth |
| Completeness | 15% | 5 — All 8 issues covered with rollback notes |
| Harsh Critic Verdict | 15% | 4 — One tradeoff: SearchForm refactor deferred (P2-8) |
| Specificity | 10% | 5 — Every step has exact file, line, and code change |

**Verdict**: EXECUTE with standard review

---

## Executive Summary

7 targeted fixes across 9 files. No architectural changes. No new dependencies. Reuses existing `CircuitBreaker` class from `src/lib/circuit-breaker.ts`. Estimated diff: ~150 lines added, ~20 lines modified. Each fix is independently deployable and independently revertible.

---

## Implementation Steps

### Step 1: V2 Search Circuit Breaker (P0-1)

**Problem**: Every SSR request tries V2 (10s timeout) before V1 fallback. During V2 outage, all page loads add 10s latency.

**Files**:
- MODIFY `src/lib/circuit-breaker.ts:212-254` — Add `searchV2` to `circuitBreakers` registry
- MODIFY `src/app/search/page.tsx:197-244` — Wrap V2 call in circuit breaker
- MODIFY `src/app/search/actions.ts:44-78` — Wrap V2 call in circuit breaker

**Change 1a** — Add circuit breaker instance to `src/lib/circuit-breaker.ts`:

```typescript
// Add to circuitBreakers object (after supabaseStorage):
searchV2: new CircuitBreaker({
  name: "search-v2",
  failureThreshold: 3,    // Open after 3 consecutive failures
  resetTimeout: 30000,    // Try again after 30s
  successThreshold: 1,    // Close after 1 success in half-open
}),
```

**Why these thresholds**: 3 failures is aggressive enough to protect users quickly (30s of degraded service max = 3 * 10s timeout). 30s reset is short enough to recover fast when V2 comes back. 1 success threshold for fast recovery since V2 either works or doesn't (no gradual recovery pattern).

**Change 1b** — Wrap V2 in circuit breaker in `src/app/search/page.tsx`:

```typescript
// At top of file, add import:
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";

// Replace lines 197-244 (the if (useV2Search) block):
if (useV2Search) {
  try {
    const rawParamsForV2 = buildRawParamsFromSearchParams(/* ... existing code ... */);

    const v2Result = await circuitBreakers.searchV2.execute(() =>
      withTimeout(
        executeSearchV2({
          rawParams: rawParamsForV2,
          limit: DEFAULT_PAGE_SIZE,
          includeMap: false,
        }),
        DEFAULT_TIMEOUTS.DATABASE,
        "SSR-executeSearchV2"
      )
    );

    if (v2Result.response && v2Result.paginatedResult) {
      usedV2 = true;
      paginatedResult = v2Result.paginatedResult;
      v2NextCursor = v2Result.response.list.nextCursor ?? null;
    } else if (v2Result.error) {
      const sanitized = sanitizeErrorMessage(v2Result.error);
      console.warn("[search/page] V2 returned error:", sanitized);
    }
  } catch (err) {
    if (isCircuitOpenError(err)) {
      // Circuit open — skip V2 entirely, no timeout delay
      // This is the critical path: saves 10s latency during V2 outage
    } else {
      const sanitized = sanitizeErrorMessage(err);
      console.warn("[search/page] V2 failed, falling back to v1:", { error: sanitized });
    }
  }
}
```

**Change 1c** — Same pattern in `src/app/search/actions.ts` for `fetchMoreListings`:

```typescript
// Add import at top:
import { circuitBreakers, isCircuitOpenError } from "@/lib/circuit-breaker";

// Wrap the v2 call inside fetchMoreListings (line 45-78):
if (features.searchV2) {
  try {
    const v2Result = await circuitBreakers.searchV2.execute(() =>
      withTimeout(
        executeSearchV2({ rawParams: rawParamsForV2, limit: DEFAULT_PAGE_SIZE }),
        DEFAULT_TIMEOUTS.DATABASE,
        "fetchMoreListings-executeSearchV2"
      )
    );
    // ... existing success handling ...
  } catch (error) {
    if (isCircuitOpenError(error)) {
      // Circuit open — skip straight to V1 fallback
    } else {
      console.warn("[fetchMoreListings] V2 failed, falling back to v1", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
```

**Test**: Unit test in `src/__tests__/lib/circuit-breaker.test.ts` already covers the CircuitBreaker class. Add integration test: 3 consecutive V2 timeouts → 4th request skips V2 entirely (no 10s wait).

**Rollback**: Remove circuit breaker wrapping; V2 calls revert to direct invocation. Zero risk.

---

### Step 2: Sentry Capture for SSR V2 Failures (P0-2)

**Problem**: `page.tsx` uses `console.warn` for V2 failures. API route uses `Sentry.captureException`. SSR failures are invisible to error monitoring.

**Files**:
- MODIFY `src/app/search/page.tsx:235-244`
- MODIFY `src/app/search/actions.ts:74-78`

**Change 2a** — Add Sentry import and capture in `page.tsx`:

```typescript
// Add import at top:
import * as Sentry from "@sentry/nextjs";

// In the catch block (line 235-244), replace console.warn:
} catch (err) {
  if (isCircuitOpenError(err)) {
    // Expected during V2 outage — don't alert, just log
    logger.sync.info("[search/page] V2 circuit open, using V1 fallback");
  } else {
    // Unexpected V2 failure — capture for monitoring
    Sentry.captureException(err, {
      tags: { component: "search-ssr", path: "v2-fallback" },
      extra: { hasV2Override: v2Override },
    });
    logger.sync.warn("[search/page] V2 failed, falling back to v1", {
      error: sanitizeErrorMessage(err),
    });
  }
}
```

**Change 2b** — Same in `actions.ts` (line 74-78):

```typescript
} catch (error) {
  if (!isCircuitOpenError(error)) {
    Sentry.captureException(error, {
      tags: { component: "search-action", path: "fetchMoreListings-v2" },
    });
  }
  console.warn("[fetchMoreListings] V2 failed, falling back to v1", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
}
```

**Key decision**: Circuit-open errors are NOT sent to Sentry (they're expected during outage). Only unexpected failures are captured. This prevents Sentry flood during V2 outage.

**Rollback**: Remove Sentry.captureException calls. Zero risk.

---

### Step 3: Load More Degradation Signal (P0-3)

**Problem**: When V2 is down, "Show more places" silently returns empty and disappears. User sees 12 results with no explanation.

**Files**:
- MODIFY `src/app/search/actions.ts:13-17,81-88`
- MODIFY `src/components/search/SearchResultsClient.tsx:169-211`

**Change 3a** — Add `degraded` flag to `FetchMoreResult` in `actions.ts`:

```typescript
export interface FetchMoreResult {
  items: ListingData[];
  nextCursor: string | null;
  hasNextPage: boolean;
  /** True when V2 is unavailable and V1 can't continue pagination */
  degraded?: boolean;
}
```

**Change 3b** — Return degraded signal instead of silent empty in `actions.ts:81-88`:

```typescript
// V1 fallback reached — signal degradation to client
console.warn("[fetchMoreListings] V1 fallback reached - cursor pagination not supported");
return { items: [], nextCursor: null, hasNextPage: false, degraded: true };
```

**Change 3c** — Handle degraded state in `SearchResultsClient.tsx`:

In `handleLoadMore` (around line 178), after the fetchMoreListings call:

```typescript
const result = await fetchMoreListings(nextCursor, rawParams);

if (result.degraded) {
  setLoadError("More results are temporarily unavailable. Try refreshing the page.");
  setNextCursor(null); // Remove the button
  return; // Skip processing
}
```

This reuses the existing `loadError` state and retry UI — no new components needed.

**Rollback**: Remove `degraded` field. Client reverts to silent empty behavior. Backward compatible (field is optional).

---

### Step 4: Cursor Corruption Guard (P1-4)

**Problem**: If a cursor key contains a non-numeric string, `parseFloat` returns NaN, which gets pushed as a SQL parameter and causes a DB error.

**Risk reassessment**: After reading `cursor.ts`, I found that `decodeKeysetCursor` validates cursor structure via Zod schema + HMAC signature + key count check. A corrupted cursor would be rejected as `null` by `decodeCursorAny` in `search-v2-service.ts:144`, which falls through to offset pagination. **The actual risk is lower than initially assessed** — it requires HMAC bypass OR missing CURSOR_SECRET in production.

However, defense-in-depth is warranted since `getCursorSecret()` warns but doesn't throw in dev, meaning dev/staging environments could have unsigned cursors.

**File**: MODIFY `src/lib/search/search-doc-queries.ts:210-393`

**Change 4** — Add NaN guard at the top of `buildKeysetWhereClause`:

```typescript
export function buildKeysetWhereClause(
  cursor: KeysetCursor,
  sort: SortOption,
  startParamIndex: number
): { clause: string; params: unknown[]; nextParamIndex: number } {
  // Defense-in-depth: Validate cursor key values are parseable
  // Rejects cursors with NaN keys that would cause DB errors
  for (const key of cursor.k) {
    if (key !== null && key !== undefined) {
      // Date strings contain letters — only validate numeric-looking keys
      if (/^-?\d/.test(key) && !key.includes('T') && !key.includes('-', 1)) {
        if (!Number.isFinite(parseFloat(key))) {
          return { clause: "FALSE", params: [], nextParamIndex: startParamIndex };
        }
      }
    }
  }
  // ... rest of function unchanged
```

Wait — that heuristic is fragile. Better approach: validate at each `parseFloat` call site since we know which keys are numeric vs timestamp:

```typescript
// Line 230 — recommended sort:
const cursorScore = cursor.k[0] !== null ? parseFloat(cursor.k[0]) : null;
if (cursorScore !== null && !Number.isFinite(cursorScore)) {
  return { clause: "FALSE", params: [], nextParamIndex: startParamIndex };
}

// Line 273 — price_asc sort:
const cursorPrice = cursor.k[0] !== null ? parseFloat(cursor.k[0]) : null;
if (cursorPrice !== null && !Number.isFinite(cursorPrice)) {
  return { clause: "FALSE", params: [], nextParamIndex: startParamIndex };
}

// Line 305 — price_desc sort (same pattern)

// Lines 338-341 — rating sort:
const cursorRating = cursor.k[0] !== null ? parseFloat(cursor.k[0]) : null;
const cursorCount = cursor.k[1] !== null ? parseInt(cursor.k[1], 10) : null;
if (
  (cursorRating !== null && !Number.isFinite(cursorRating)) ||
  (cursorCount !== null && !Number.isFinite(cursorCount))
) {
  return { clause: "FALSE", params: [], nextParamIndex: startParamIndex };
}
```

Returning `{ clause: "FALSE" }` produces `WHERE ... AND FALSE` which returns 0 rows — the client sees "no more results" instead of a 500 error. This is the safest degradation.

**Test**: Add test case in `src/__tests__/` — call `buildKeysetWhereClause` with cursor containing `k: ["not-a-number"]` → assert returns `FALSE` clause.

**Rollback**: Remove guards. Worst case returns to current behavior (500 on NaN cursor). Low risk.

---

### Step 5: createTTLCache Cleanup Documentation (P1-5)

**Problem**: `setInterval(sweep, 60_000)` is never cleaned up.

**Risk reassessment**: Only 2 module-level instances exist (`useFacets.ts:20` and `useDebouncedFilterCount.ts`). These are intentional singletons — they live for the lifetime of the browser tab. The interval runs sweep() which only iterates expired entries (O(expired) not O(n)). **This is actually working as designed.**

**File**: MODIFY `src/hooks/createTTLCache.ts:23-38`

**Change 5** — Add `destroy()` for completeness + document singleton intent:

```typescript
export interface TTLCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs: number): void;
  clear(): void;
  /** Stop periodic sweep. Call only if cache is no longer needed. */
  destroy(): void;
  readonly size: number;
}

export function createTTLCache<T>(maxSize: number = 100): TTLCache<T> {
  const store = new Map<string, CacheEntry<T>>();
  let sweepInterval: ReturnType<typeof setInterval> | null = null;

  // ... sweep function unchanged ...

  if (typeof window !== "undefined") {
    sweepInterval = setInterval(sweep, 60_000);
  }

  return {
    // ... get, set, clear unchanged ...
    destroy(): void {
      if (sweepInterval !== null) {
        clearInterval(sweepInterval);
        sweepInterval = null;
      }
      store.clear();
    },
    get size(): number {
      return store.size;
    },
  };
}
```

**Rollback**: Remove `destroy()` method. No behavioral change to existing code.

---

### Step 6: useFacets Error Tracking (P2-6)

**Problem**: All non-200 responses return empty facets with only `console.warn`. Misconfigured endpoints are invisible.

**File**: MODIFY `src/hooks/useFacets.ts:193-215`

**Change 6** — Add Sentry breadcrumb for unexpected statuses:

```typescript
// After line 206 (the console.warn for unexpected status):
console.warn(`[useFacets] Unexpected status ${response.status}, returning empty facets`);

// Add Sentry breadcrumb (not an exception — facets are non-critical):
if (typeof window !== "undefined" && window.Sentry) {
  window.Sentry.addBreadcrumb({
    category: "search.facets",
    message: `Facets API returned ${response.status}`,
    level: "warning",
    data: { url: url.split("?")[0] }, // Strip query params for privacy
  });
}
```

Actually, the cleaner pattern for Next.js client-side Sentry:

```typescript
// At top of file:
import * as Sentry from "@sentry/nextjs";

// Replace the console.warn block (lines 207-214):
Sentry.addBreadcrumb({
  category: "search.facets",
  message: `Facets returned ${response.status}`,
  level: "warning",
});
```

This won't send an alert but WILL appear in Sentry breadcrumbs when a real error IS captured later — giving context for debugging.

**Rollback**: Remove breadcrumb. Zero risk.

---

### Step 7: ZeroResultsSuggestions Bounds Guard (P2-7)

**Problem**: Antimeridian expansion math could produce invalid bounds if inputs are degenerate (e.g., identical minLng/maxLng).

**Risk reassessment**: The code already has `Math.max(0.02, ...)` guards on span calculations (lines 81, 91). After re-reading, the actual risk is that `normalizeLng360` could produce unexpected results for longitude values exactly at -180 or 180. But `Math.max(0.02, rawLngSpan)` prevents zero-division and the `expandedLngSpan` is clamped to `Math.min(359.9, ...)`.

**File**: MODIFY `src/components/ZeroResultsSuggestions.tsx:62-114`

**Change 7** — Add output validation after expansion:

```typescript
// After line 111 (after setting all 4 expanded params):
// Validate expanded bounds are sane before navigation
const expandedMinLat = parseFloat(params.get("minLat") ?? "");
const expandedMaxLat = parseFloat(params.get("maxLat") ?? "");
if (!Number.isFinite(expandedMinLat) || !Number.isFinite(expandedMaxLat) ||
    expandedMinLat >= expandedMaxLat) {
  // Expansion produced invalid bounds — fall through to fallback
  params.delete("minLat");
  params.delete("maxLat");
  params.delete("minLng");
  params.delete("maxLng");
  params.delete("q");
}
```

This is a safety net that catches any edge case in the expansion math and degrades to browse-all mode instead of navigating to an invalid URL.

**Rollback**: Remove validation. Returns to current behavior. Zero risk.

---

## Dependency Graph

```
Step 1 (Circuit Breaker) ─── no deps ───────────────┐
Step 2 (Sentry Capture) ─── depends on Step 1 ──────┤
Step 3 (Load More Signal) ── depends on Step 1 ──────┤
Step 4 (Cursor Validation) ─ no deps ────────────────┤── All merge to main
Step 5 (TTL Cache) ───────── no deps ────────────────┤
Step 6 (Facets Breadcrumb) ─ no deps ────────────────┤
Step 7 (Bounds Guard) ────── no deps ────────────────┘
```

**Optimal execution order**: Steps 1→2→3 (sequential, same code areas), then Steps 4-7 in parallel.

---

## Test Strategy

| Step | Test Type | What to verify |
|------|-----------|---------------|
| 1 | Unit | CircuitBreaker with searchV2 thresholds; 3 failures → open → skip |
| 1 | Integration | page.tsx renders V1 results when circuit is open (no 10s delay) |
| 2 | Manual | Trigger V2 failure → verify Sentry event appears with correct tags |
| 3 | Unit | fetchMoreListings returns `degraded: true` when V1 fallback |
| 3 | Component | SearchResultsClient shows error message when `degraded` received |
| 4 | Unit | buildKeysetWhereClause with NaN cursor key → returns FALSE clause |
| 5 | Unit | createTTLCache.destroy() stops interval and clears store |
| 6 | Manual | Return 403 from facets → verify Sentry breadcrumb recorded |
| 7 | Unit | Expansion math with identical minLng/maxLng → valid output or fallback |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Circuit breaker opens too aggressively | Low | Medium | 3-failure threshold matches existing patterns (redis=3, postgis=3) |
| Sentry flood during V2 outage | Low | Low | CircuitOpenError explicitly excluded from capture |
| `degraded` field breaks old clients | None | None | Field is optional, additive change |
| FALSE clause in cursor validation returns 0 rows unexpectedly | Very Low | Low | Only triggers on HMAC bypass + NaN key — virtually impossible in prod |
| Module-level circuit breaker state lost on serverless cold start | Expected | None | Cold starts reset to CLOSED — this is correct (retry V2 on new instance) |

---

## Pre-Mortem: What Could Go Wrong

| Failure | Prevention |
|---------|-----------|
| Circuit breaker singleton shared across concurrent requests in same serverless instance | This is the DESIRED behavior — one instance protects all requests |
| `import * as Sentry` in page.tsx fails at build time | Sentry is already imported in API routes; @sentry/nextjs is a project dependency |
| Step 3 `degraded` field not serialized across server action boundary | Server actions serialize return values via React Flight; plain booleans serialize fine |
| Cursor NaN guard returns FALSE when cursor is actually valid | Only triggers when `parseFloat` returns NaN — impossible for valid numeric strings |

---

## Rollback Plan

Every step is independently revertible by reverting the specific file changes. No database migrations. No schema changes. No dependency additions. Each step can be deployed and rolled back independently via feature branch or single-commit revert.

---

## What's NOT in this plan (and why)

**SearchForm.tsx refactor (P2-8)**: This is a maintenance/architecture concern, not a stability issue. The 1,279-line file works correctly. Refactoring it is a separate task that should be planned independently with its own test strategy. Including it here would increase the blast radius of a stability-focused sprint.

---

## Open Questions

None. All file paths, line numbers, function signatures, and import paths verified against current codebase state.
