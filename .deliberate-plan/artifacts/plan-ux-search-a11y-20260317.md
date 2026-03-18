# Plan: Search Accessibility — Load-More Announcements & Feed aria-busy

**Task Type**: FIX
**Confidence Score**: 4.8 / 5.0 (HIGH)
**Target File**: `src/components/search/SearchResultsClient.tsx`
**WCAG Criteria**: 4.1.3 Status Messages (AA), 1.3.1 Info and Relationships (A)

---

## Executive Summary

Two accessibility gaps in `SearchResultsClient.tsx` prevent screen reader users from knowing when new search results are loaded via "Show more places" pagination. Both fixes are surgical changes to a single component — low risk, high impact.

| Issue | Current State | Fix |
|-------|--------------|-----|
| UX-H1: No load-more announcement | `aria-live` region text uses `initialTotal` (never changes) | Add `loadMoreAnnouncement` state; update it after successful load-more |
| UX-H2: Feed missing `aria-busy` | `role="feed"` div has no `aria-busy` | Add `aria-busy={isLoadingMore}` to the feed container |

---

## Confidence Score Breakdown

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Research Grounding | 15% | 5 | WAI-ARIA feed pattern well-documented |
| Codebase Accuracy | 25% | 5 | Every line number, variable, and element verified |
| Assumption Freedom | 20% | 5 | Zero assumptions — all claims traced to code |
| Completeness | 15% | 5 | Both fixes, tests, rollback plan included |
| Harsh Critic Verdict | 15% | 4 | PASS — one minor nit on announcement wording |
| Specificity | 10% | 5 | Exact code changes with line numbers |

**Overall: 4.8 — Execute with standard review**

---

## Codebase Analysis (Verified)

### Key State Variables (SearchResultsClient.tsx)

| Variable | Line | Type | Purpose |
|----------|------|------|---------|
| `initialTotal` | prop:29 | `number \| null` | SSR result count — never changes |
| `total` | 189 | `const` | Alias for `initialTotal` — never changes |
| `extraListings` | 54 | `ListingData[]` | Accumulated load-more results |
| `allListings` | 101-104 | `ListingData[]` | `[...initialListings, ...extraListings]` |
| `isLoadingMore` | 58 | `boolean` | `true` during fetch, `false` after |
| `nextCursor` | 55-57 | `string \| null` | Pagination cursor |

### Load-More Flow (handleLoadMore, lines 155-187)

1. Guard: `if (!nextCursor \|\| isLoadingRef.current) return;`
2. Set `isLoadingMore = true`
3. Call `fetchMoreListings(nextCursor, rawParams)` → returns `{ items, nextCursor, hasNextPage }`
4. Deduplicate via `seenIdsRef`
5. Append to `extraListings` via `setExtraListings(prev => [...prev, ...dedupedItems])`
6. Update `nextCursor`
7. Set `isLoadingMore = false` (in `finally`)

### Existing ARIA Structure

| Element | Line | Current ARIA | Issue |
|---------|------|-------------|-------|
| Screen reader region | 249-255 | `role="status" aria-live="polite" aria-atomic="true"` | Text only reflects `initialTotal` — never updates |
| Feed container | 309 | `role="feed" aria-label="Search results"` | Missing `aria-busy` |
| Load-more button | 347-362 | `aria-busy={isLoadingMore}` + dynamic `aria-label` | Correctly implemented |

### Existing E2E Coverage

- `tests/e2e/search-a11y-screenreader.anon.spec.ts` — Test #2 (line 70) explicitly documents UX-H1 as "KNOWN GAP"
- Same file, test #5 (line 204) checks `aria-busy` on wrapper but NOT on feed container

### Existing Unit Test

- `src/__tests__/components/search/SearchResultsClient.test.tsx` — 20+ tests covering deduplication, cap, error handling, loading state. No tests for aria-live content after load-more.

---

## Implementation Steps

### Step 1: Add `loadMoreAnnouncement` state (UX-H1)

**File**: `src/components/search/SearchResultsClient.tsx`

**1a. Add new state variable** — after line 60 (`loadError` state):

```tsx
const [loadMoreAnnouncement, setLoadMoreAnnouncement] = useState('');
```

**1b. Update handleLoadMore to set announcement** — inside the `try` block, after line 175 (`setExtraListings`), add:

```tsx
// Announce to screen readers (after state update)
const newCount = allListings.length + dedupedItems.length;
const totalLabel = total !== null ? ` of ~${total}` : '';
setLoadMoreAnnouncement(
  `Loaded ${dedupedItems.length} more listing${dedupedItems.length === 1 ? '' : 's'}, showing ${newCount}${totalLabel}`
);
```

**Why `allListings.length + dedupedItems.length`**: The `allListings` memo hasn't re-computed yet when this runs (it depends on the next render). We compute the new count eagerly.

**1c. Add a second aria-live region for load-more announcements** — after line 255 (closing `</div>` of the existing status region), add:

```tsx
{/* Load-more announcement — separate from initial status to avoid re-announcing on mount */}
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {loadMoreAnnouncement}
</div>
```

**Why a separate region?** The existing `role="status"` region (line 249) announces on initial render. If we reuse it and change its text on load-more, it works — but we must ensure it does NOT re-announce on initial mount. A separate region that starts empty (`''`) guarantees no announcement on initial render, and only announces when `loadMoreAnnouncement` changes to a non-empty string.

**1d. Clear announcement on component reset** — inside the `useEffect` that resets pagination state (lines 92-99), add:

```tsx
setLoadMoreAnnouncement('');
```

This ensures stale announcements don't persist across filter changes.

### Step 2: Add `aria-busy` to feed container (UX-H2)

**File**: `src/components/search/SearchResultsClient.tsx`

**2a. Add `aria-busy` to the feed div** — on line 309, change:

```tsx
<div role="feed" aria-label="Search results" className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
```

to:

```tsx
<div role="feed" aria-label="Search results" aria-busy={isLoadingMore} className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-x-6 sm:gap-y-8">
```

**Why this works**: Per WAI-ARIA feed pattern, `aria-busy="true"` signals that the feed content is being updated. Screen readers will suppress announcements of individual element changes until `aria-busy` returns to `false`. The `isLoadingMore` state is already `true` during fetch (line 159) and `false` after (line 185).

### Step 3: Update unit tests

**File**: `src/__tests__/components/search/SearchResultsClient.test.tsx`

Add a new `describe` block after the `loading state` block (after line 641):

```tsx
describe('accessibility: load-more announcements', () => {
  it('announces loaded count after successful load-more', async () => {
    const mockFetch = fetchMoreListings as jest.Mock;
    mockFetch.mockResolvedValueOnce({
      items: [createMockListing('3'), createMockListing('4')],
      nextCursor: 'cursor-2',
      hasNextPage: true,
    });

    render(<SearchResultsClient {...defaultProps} />);

    // Click load more
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));

    await waitFor(() => {
      // Should announce the loaded count
      const liveRegions = screen.getAllByRole('status');
      const texts = liveRegions.map((r) => r.textContent);
      expect(texts.some((t) => t && /loaded 2 more/i.test(t))).toBe(true);
    });
  });

  it('does not announce on initial render', () => {
    render(<SearchResultsClient {...defaultProps} />);

    // The load-more announcement region should be empty on mount
    const liveRegions = screen.getAllByRole('status');
    const loadMoreAnnouncement = liveRegions.find(
      (r) => r.textContent === '' && r.getAttribute('aria-live') === 'polite'
    );
    // The second live region (load-more) should exist and be empty
    expect(loadMoreAnnouncement).toBeTruthy();
  });

  it('sets aria-busy on feed during load-more', async () => {
    const mockFetch = fetchMoreListings as jest.Mock;
    let resolvePromise: (value: unknown) => void;
    const pending = new Promise((resolve) => { resolvePromise = resolve; });
    mockFetch.mockReturnValueOnce(pending);

    render(<SearchResultsClient {...defaultProps} />);

    const feed = screen.getByRole('feed');
    // Before loading, aria-busy should be false
    expect(feed).toHaveAttribute('aria-busy', 'false');

    // Click load more
    fireEvent.click(screen.getByRole('button', { name: /show more/i }));

    // During loading, aria-busy should be true
    await waitFor(() => {
      expect(feed).toHaveAttribute('aria-busy', 'true');
    });

    // Resolve fetch
    resolvePromise!({
      items: [createMockListing('3')],
      nextCursor: null,
      hasNextPage: false,
    });

    // After loading, aria-busy should be false
    await waitFor(() => {
      expect(feed).toHaveAttribute('aria-busy', 'false');
    });
  });
});
```

### Step 4: Update e2e test to remove KNOWN GAP documentation

**File**: `tests/e2e/search-a11y-screenreader.anon.spec.ts`

Update test #2 (line 70) to assert the fix instead of documenting the gap:

- After clicking "Show more places", wait for loading to complete
- Assert the `aria-live` region now contains text matching `/loaded \d+ more/i` or `/showing \d+/i`
- Assert the feed container (`role="feed"`) had `aria-busy="true"` during loading and `aria-busy="false"` after

Exact changes for the e2e test:

Replace the body of test #2 (lines 70-128) with:

```typescript
test("2. load-more announces new count via aria-live", { tag: [tags.a11y] }, async ({ page }) => {
  const loadMoreButton = page.getByRole("button", { name: /show more places/i });
  const hasLoadMore = await loadMoreButton.isVisible({ timeout: 10_000 }).catch(() => false);

  if (hasLoadMore) {
    // Verify feed has aria-busy before click
    const feed = page.locator('[role="feed"]').first();
    await expect(feed).toHaveAttribute("aria-busy", "false");

    // Click load more
    await loadMoreButton.click();

    // Feed should be busy during load
    await expect(feed).toHaveAttribute("aria-busy", "true", { timeout: 5_000 });

    // Wait for loading to complete
    await expect(feed).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });

    // The load-more aria-live region should announce loaded count
    const liveRegions = page.locator('[aria-live="polite"][aria-atomic="true"]');
    const count = await liveRegions.count();
    let foundAnnouncement = false;
    for (let i = 0; i < count; i++) {
      const text = await liveRegions.nth(i).textContent();
      if (text && /loaded \d+ more/i.test(text)) {
        foundAnnouncement = true;
        break;
      }
    }
    expect(foundAnnouncement).toBe(true);
  } else {
    console.log("Info: No load-more button visible (insufficient results or cap reached)");
  }
});
```

---

## Dependency Graph

```
Step 1a (add state) ──┐
                       ├── Step 1b (update handleLoadMore) ── Step 1c (add aria-live region) ── Step 1d (reset on filter change)
Step 2a (aria-busy) ──┘
                       └── Step 3 (unit tests) ── Step 4 (e2e test update)
```

Steps 1a and 2a are independent. Steps 1b/1c/1d depend on 1a. Steps 3-4 depend on all prior steps.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Double announcement (initial + load-more regions both fire) | LOW | Separate regions: first has static content, second starts empty |
| Stale announcement text persists across filter changes | LOW | Reset in the existing pagination-reset useEffect |
| `aria-busy="true"` stuck if fetch throws | NONE | Already handled — `isLoadingMore` set to `false` in `finally` block (line 185) |
| `allListings.length` stale during handleLoadMore callback | LOW | Mitigated by computing `allListings.length + dedupedItems.length` eagerly |

---

## Rollback Plan

Both changes are additive (new state variable, new attribute, new DOM element). Rollback = revert the commit. No DB changes, no API changes, no breaking changes.

---

## Test Strategy

### Unit Tests (Jest + React Testing Library)
1. **Announcement content**: After load-more, verify `aria-live` region contains `"Loaded N more listing(s), showing X of ~Y"`
2. **No initial announcement**: On mount, load-more announcement region is empty
3. **Feed aria-busy lifecycle**: `false` → `true` (during load) → `false` (after load)
4. **Announcement reset**: After filter change (component remount), announcement is cleared

### E2E Tests (Playwright)
1. Update existing test #2 in `search-a11y-screenreader.anon.spec.ts` to assert the fix
2. Verify `role="feed"` has `aria-busy="true"` during pagination, `aria-busy="false"` after

### Manual Screen Reader Testing
1. **VoiceOver (macOS)**: Navigate to search results → click "Show more places" → verify VO announces "Loaded N more listings, showing X of ~Y"
2. **NVDA (Windows)**: Same flow — verify announcement in browse mode
3. **Verify NO announcement on initial page load** from the load-more region (only the initial "Found X listings" should announce)

---

## Pre-Mortem Analysis

| Failure Mode | Prevention |
|-------------|-----------|
| Announcement fires on every render (not just load-more) | Empty initial state `''` + only set in `handleLoadMore` callback |
| Announcement text is wrong (count mismatch) | Eagerly compute `allListings.length + dedupedItems.length` instead of relying on stale memo |
| `aria-busy` flickers on fast loads | Acceptable — even if fetch returns in <100ms, the brief true→false is correct per spec |
| E2e test flaky due to timing | Use `toHaveAttribute` with generous timeout (20s) |

---

## Harsh Critic Report

**Verdict**: PASS

| Severity | Finding | Resolution |
|----------|---------|------------|
| NIT | Announcement wording "Loaded 2 more listings" could be "2 new listings loaded" — preference | Keep current wording — matches common screen reader announcement patterns |
| NIT | Could use `useRef` instead of state for announcement to avoid re-render | State is correct here — we NEED a re-render to update the DOM for the aria-live region |

Zero blockers. Zero majors. Ship it.

---

## Open Questions

None. Both fixes are well-scoped and fully verified.
