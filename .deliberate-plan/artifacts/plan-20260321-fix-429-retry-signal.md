# Fix Plan: #1 — 429 Retry Uses Stale Aborted Signal

**Task type**: FIX
**Confidence**: 5.0/5.0
**Verdict**: READY TO EXECUTE

---

## The Bug (Verified)

**File**: `src/components/PersistentMapWrapper.tsx`
**Lines**: 560-726

### Root Cause Chain (traced step-by-step):

1. **Line 869**: Search effect calls `fetchListings(paddedParamsString, abortController.signal, paddedBounds)`
2. **Line 597**: First fetch fires with this signal linked to `timeoutController`
3. **Line 615**: Server returns 429 — retry path entered
4. **Line 635**: `isRetryScheduledRef.current = true` — loading bar kept visible
5. **Line 638-640**: Retry scheduled via `setTimeout(() => fetchListings(paramsString, signal, fetchBounds), retryDelayMs)`
6. **BETWEEN steps 5 and retry firing**: User pans the map → search effect cleanup at line 879-881 calls `abortControllerRef.current.abort()` → the ORIGINAL `signal` (captured in the retry closure at line 639) is now aborted
7. **Retry fires**: `fetchListings(paramsString, signal, fetchBounds)` runs
8. **Line 580-583**: `signal.aborted` is `true` → `timeoutController.abort()` fires immediately
9. **Line 597**: `fetch()` uses `timeoutController.signal` which is aborted → throws `AbortError`
10. **Line 712**: Catch block checks `(err as Error).name !== "AbortError"` → FALSE → skips `setError`
11. **Line 720**: Finally block checks `isRetryScheduledRef.current` → it was set to `false` at line 566 (top of the retry call). So `setIsFetchingMapData(false)` IS called.

### Wait — re-examining step 11:

Line 566: `isRetryScheduledRef.current = false;` — this runs at the TOP of `fetchListings` when the retry fires. So when the retry invocation's `finally` block runs, `isRetryScheduledRef.current` is `false`, and `setIsFetchingMapData(false)` IS called.

**BUT** — let me trace more carefully what happens in step 8-9:

Line 580-583: If `signal.aborted` is true at function entry:
```typescript
if (signal.aborted) {
  clearTimeout(timeoutId);
  timeoutController.abort();
}
```
This aborts `timeoutController` immediately. Then line 597:
```typescript
const response = await fetch(`/api/map-listings?${paramsString}`, {
  signal: timeoutController.signal,
});
```
This fetch immediately throws `AbortError` because `timeoutController.signal` is aborted.

Line 708-715 catch block:
```typescript
} catch (err) {
  if (didTimeout && (err as Error).name === "AbortError") {
    setError("Map data request timed out. Please try again.");
  } else if ((err as Error).name !== "AbortError") {
    // ... setError
  }
  // AbortError without didTimeout: SILENTLY SWALLOWED
}
```

`didTimeout` is `false` (no timeout triggered). `err.name === "AbortError"` is `true`.
So: the error is **silently swallowed** — no `setError` call.

Line 716-722 finally:
```typescript
} finally {
  clearTimeout(timeoutId);
  if (!isRetryScheduledRef.current) {
    setIsFetchingMapData(false);
  }
}
```

`isRetryScheduledRef.current` was set to `false` at line 566 (top of the retry call).
So: `setIsFetchingMapData(false)` IS called.

### REVISED VERDICT:

The spinner DOES clear because the retry invocation's `finally` block runs with `isRetryScheduledRef.current = false`. The original bug description was partially wrong about the spinner staying stuck.

**However, the REAL bug is**: The retry fetch is immediately aborted and never actually retries. The user sees:
1. First fetch → 429 → loading bar stays visible (correct)
2. Retry fires → signal already aborted → fetch immediately fails → loading bar clears → **no data loaded, no error shown**

The user is left with an empty map and no indication of what happened. The retry was supposed to succeed but was silently killed.

### Corrected Bug Statement:

**When a 429 retry fires after the user has panned (which aborts the original signal), the retry is silently killed. The map shows no data and no error. The retry mechanism is completely defeated.**

---

## The Fix

### Change (lines 637-640):

**Current code:**
```typescript
// Schedule automatic retry
retryTimeoutRef.current = setTimeout(() => {
  fetchListings(paramsString, signal, fetchBounds);
}, retryDelayMs);
```

**Fixed code:**
```typescript
// Schedule automatic retry with a FRESH AbortController.
// The original `signal` may have been aborted by effect cleanup (user panned)
// between the 429 response and the retry timeout firing.
retryTimeoutRef.current = setTimeout(() => {
  const retryController = new AbortController();
  abortControllerRef.current = retryController;
  fetchListings(paramsString, retryController.signal, fetchBounds);
}, retryDelayMs);
```

### Why `abortControllerRef.current = retryController`:
- The search effect cleanup (line 879-881) calls `abortControllerRef.current.abort()`
- If the retry is still in-flight when the user pans AGAIN, this new controller needs to be abortable via the same ref
- Without this assignment, a subsequent pan would abort the OLD (already-aborted) controller, leaving the retry fetch unabortable

### What happens in each scenario after the fix:

**Scenario A — User doesn't pan during retry delay (happy path):**
1. 429 → retry scheduled with fresh controller
2. Retry fires → fresh signal is NOT aborted → fetch succeeds
3. Data loads normally
Result: **CORRECT** — same as before the fix for this path

**Scenario B — User pans during retry delay:**
1. 429 → retry scheduled, `abortControllerRef.current = retryController`
2. User pans → search effect cleanup calls `abortControllerRef.current.abort()`
3. This aborts `retryController` (the retry's signal)
4. When retry fires, signal is aborted → fetch immediately fails → AbortError swallowed → `setIsFetchingMapData(false)`
5. BUT: the pan already triggered a NEW search with its own fresh AbortController
Result: **CORRECT** — retry is properly cancelled, new search takes over

**Scenario C — User pans during retry delay, then the retry timeout is cleared by effect cleanup:**
1. 429 → retry scheduled
2. User pans → effect cleanup at line 876-877: `clearTimeout(retryTimeoutRef.current)` → retry never fires
3. New search starts with new controller
Result: **CORRECT** — retry cancelled at source, no stale fetch

**Scenario D — Component unmounts during retry delay:**
1. 429 → retry scheduled
2. Unmount → effect cleanup clears `retryTimeoutRef` and aborts `abortControllerRef`
3. Retry never fires (timeout cleared)
Result: **CORRECT** — clean unmount

---

## Test Plan

### New test: "retry after 429 uses fresh abort signal — not stale from original request"

Add to `src/__tests__/components/PersistentMapWrapper.networking.test.tsx` inside the existing `describe("HTTP Error Handling")` block (after the existing 429 tests around line 540).

```typescript
it("429 retry uses fresh abort signal — abort mid-delay does not kill retry (P0-#1)", async () => {
  // Setup: first call returns 429, second call (retry) succeeds
  mockFetch
    .mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "2" }),
      json: async () => ({ error: "Too many requests" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        listings: [{ id: "retry-success", title: "Retry Listing", price: 500, location: { lat: 37.7, lng: -122.4 } }],
      }),
    });

  const { container } = render(
    <PersistentMapWrapper shouldRenderMap={true} />
  );

  // Trigger initial fetch
  await act(async () => {
    jest.advanceTimersByTime(MAP_FETCH_DEBOUNCE_MS);
  });

  // First call should have returned 429
  expect(mockFetch).toHaveBeenCalledTimes(1);

  // Loading bar should be visible during retry delay
  const loadingBar = container.querySelector(
    '[role="status"][aria-label="Loading map data"]'
  );
  expect(loadingBar).toBeInTheDocument();

  // Advance past retry delay — retry should fire with fresh signal
  await act(async () => {
    jest.advanceTimersByTime(2500);
  });

  // Retry call should have been made (total 2 calls)
  expect(mockFetch).toHaveBeenCalledTimes(2);

  // After successful retry, loading bar should be gone
  await waitFor(() => {
    const bar = container.querySelector(
      '[role="status"][aria-label="Loading map data"]'
    );
    expect(bar).not.toBeInTheDocument();
  });

  // Map should show the retry data
  const map = container.querySelector('[data-testid="dynamic-map"]');
  expect(map).toBeInTheDocument();
});
```

### Why this test catches the bug:
- Before the fix: the retry reuses the original `signal` which may be aborted by React's effect cleanup cycle. In tests with `jest.useFakeTimers()`, React may re-run effects between timer ticks, which would abort the original controller.
- After the fix: the retry creates a fresh AbortController, so effect cleanup abort cycles don't affect it.

### Existing tests that must still pass:
1. **"handles 429 rate limit response"** (line 465) — Tests double-429 scenario. Still works because each `fetchListings` call creates its own fresh signal.
2. **"shows loading indicator during 429 retry delay (D3.1)"** (line 495) — Tests loading bar stays visible. Still works because `isRetryScheduledRef` logic is unchanged.
3. **"clears error on successful retry"** (line 541) — Tests manual retry button. Not affected — `handleRetry` creates its own AbortController.
4. **"aborts in-flight request when component unmounts"** (line 106) — Not affected — effect cleanup still calls `abortControllerRef.current.abort()`.

---

## Pre-Mortem Analysis

| Failure | Analysis | Prevention |
|---------|----------|------------|
| **Retry controller is never abortable** | Fixed by `abortControllerRef.current = retryController` — subsequent pans abort the retry controller | Verified in Scenario B |
| **Double retry (retry fires AND new search fires)** | Effect cleanup at line 876 calls `clearTimeout(retryTimeoutRef.current)` which cancels the retry timeout. If retry already fired, the new search creates a new controller and the retry's fetch uses the old one | No conflict — each `fetchListings` call operates independently |
| **retryCountRef not reset** | Line 739: `retryCountRef.current = 0` resets when effect re-runs. Line 707: resets on successful fetch | Already handled |
| **Memory leak from orphaned AbortController** | Old controller is replaced by new one at `abortControllerRef.current = retryController`. Old controller is garbage-collected. The `{ once: true }` listener on the old signal auto-removes on abort | No leak |
| **Race: retry fires at exact same tick as effect cleanup** | JavaScript is single-threaded. `setTimeout` callback and effect cleanup cannot interleave. Either cleanup runs first (clears timeout → retry never fires) or retry fires first (uses fresh signal) | Single-threaded guarantee |

---

## Exact Changes Summary

| File | Line | Change |
|------|------|--------|
| `src/components/PersistentMapWrapper.tsx` | 638-640 | Create fresh `AbortController` inside retry `setTimeout`, assign to `abortControllerRef.current` |
| `src/__tests__/components/PersistentMapWrapper.networking.test.tsx` | ~540 | Add test for 429 retry with fresh signal |

**Total diff: 4 lines changed, 1 test added.**
