# Semantic Search E2E Tests — Technical Specification

## 1. Scope

Convert the E2E/Playwright-tagged scenarios from `tasks/semantic-search-stability-spec.md` into Playwright test files. This covers **26 scenarios** across 6 test files:

| File | Scenarios | Count |
|------|-----------|-------|
| `semantic-search-activation.anon.spec.ts` | SS-01..SS-07 | 7 |
| `semantic-search-results.anon.spec.ts` | SS-08..SS-12 | 5 |
| `semantic-search-similar-listings.anon.spec.ts` | SS-20..SS-27, SS-56, SS-57, SS-61 | 11 |
| `semantic-search-resilience.anon.spec.ts` | SS-40..SS-42, SS-55 | 4 |
| `semantic-search-cursor-reset.anon.spec.ts` | SS-58 | 1 |
| `semantic-search-xss.anon.spec.ts` | SS-60 | 1 |

**Not in scope**: API/Integration tests (SS-13..SS-19, SS-28..SS-39, SS-43..SS-54, SS-59), Unit tests (SS-29..SS-32, SS-43, SS-45..SS-48, SS-50, SS-52, SS-53, SS-59).

---

## 2. Architecture Decisions

### 2.1 File Organization

All files go in `tests/e2e/semantic-search/` (new directory). This groups semantic search E2E tests together, paralleling `tests/e2e/search-filters/`, `tests/e2e/pagination/`, etc.

```
tests/e2e/semantic-search/
  semantic-search-activation.anon.spec.ts
  semantic-search-results.anon.spec.ts
  semantic-search-similar-listings.anon.spec.ts
  semantic-search-resilience.anon.spec.ts
  semantic-search-cursor-reset.anon.spec.ts
  semantic-search-xss.anon.spec.ts
```

### 2.2 Naming Convention

- `.anon.spec.ts` suffix: All tests run as anonymous users (no auth required). The Playwright config's `chromium-anon` project matches `*.anon.spec.ts`. Search and listing detail pages are publicly accessible.
- Exception: SS-57 (FavoriteButton toggle) mentions auth but the test only validates the *render state* (unsaved/outline), which is visible without auth. Full toggle testing is out of scope.

### 2.3 Environment Awareness Strategy

**Two-tier approach**:

| Tier | Scenarios | Strategy |
|------|-----------|----------|
| **Environment-agnostic** | SS-01..SS-07 (activation/fallback) | Tests verify search *works* (returns results, no errors). When semantic search is off, they verify FTS fallback still delivers results. Never assert "semantic search is active" directly. |
| **Semantic-required** | SS-08..SS-12 (results quality), SS-58 (cursor reset) | Skip when `ENABLE_SEMANTIC_SEARCH !== 'true'` using `test.skip()`. These tests require semantic search to be meaningfully validated. |
| **Similar listings** | SS-20..SS-27, SS-56, SS-57, SS-61 | Skip gracefully if "Similar listings" heading is not visible (embedding backfill may not have run). Individual tests use `test.skip()` on missing section. |
| **Resilience** | SS-40..SS-42, SS-55 | Environment-agnostic — they verify search returns results regardless of backend state. |

### 2.4 Import Pattern

All files use the project's standard import from the helpers directory:

```typescript
import { test, expect, tags, SF_BOUNDS, searchResultsContainer, selectors, timeouts } from "../helpers/test-utils";
```

For filter-related helpers:
```typescript
import { SEARCH_URL, boundsQS, getUrlParam } from "../helpers/filter-helpers";
```

### 2.5 No New Helper Files

All needed utilities already exist:
- `searchResultsContainer(page)` — scoped container for dual-render
- `SF_BOUNDS` — San Francisco bounding box
- `boundsQS` / `SEARCH_URL` — URL construction
- `tags.core` / `tags.smoke` — test tagging
- `timeouts.action` — standard wait timeout

### 2.6 Listing Detail Page Selectors

For similar listings tests, these selectors target the detail page:

| Element | Selector |
|---------|----------|
| Similar listings heading | `page.getByRole('heading', { name: 'Similar listings' })` |
| Similar listings grid | Heading's parent `div.grid` or `div.grid.grid-cols-1.sm\\:grid-cols-2` |
| Individual cards | `[data-testid="listing-card"]` within the section |
| Card link | `a[href*="/listings/"]` within each card |
| Card listing ID | `[data-listing-id]` attribute |
| Show on map button | `button[aria-label="Show on map"]` |
| Favorite button | FavoriteButton component (heart icon button) |
| Price | `[data-testid="listing-price"]` |

---

## 3. File Plan

### 3.1 `semantic-search-activation.anon.spec.ts`

**Purpose**: Verify search works under all activation conditions.

| ID | Title | Priority | Skip Condition |
|----|-------|----------|----------------|
| SS-01 | Semantic search with valid query + recommended sort | P0 | None (env-agnostic) |
| SS-02 | Short query (< 3 chars) falls back to FTS | P1 | None |
| SS-03 | Non-recommended sort bypasses semantic search | P0 | None |
| SS-04 | Feature flag off uses FTS | P0 | None |
| SS-05 | Empty semantic results trigger FTS fallback | P0 | None |
| SS-06 | Browse-mode (no query) does not trigger semantic | P1 | None |
| SS-07 | Long query (201+ chars) is handled gracefully | P2 | None |

**Key assertion pattern**: Navigate, wait for cards or empty state, verify no crash/error.

### 3.2 `semantic-search-results.anon.spec.ts`

**Purpose**: Verify semantic result quality when semantic search is active.

| ID | Title | Priority | Skip Condition |
|----|-------|----------|----------------|
| SS-08 | Listing cards display all required fields | P0 | `!ENABLE_SEMANTIC_SEARCH` |
| SS-09 | Load More pagination works | P0 | `!ENABLE_SEMANTIC_SEARCH` |
| SS-10 | Filters apply to semantic results | P0 | `!ENABLE_SEMANTIC_SEARCH` |
| SS-11 | SEMANTIC_WEIGHT affects ranking | P1 | `!ENABLE_SEMANTIC_SEARCH` |
| SS-12 | Geographic bounds filter semantic results | P0 | `!ENABLE_SEMANTIC_SEARCH` |

### 3.3 `semantic-search-similar-listings.anon.spec.ts`

**Purpose**: Verify the "Similar listings" section on listing detail pages.

| ID | Title | Priority | Skip Condition |
|----|-------|----------|----------------|
| SS-20 | Section renders with ListingCards | P0 | Section not visible |
| SS-21 | Section hidden when flag is off | P0 | None (env-agnostic) |
| SS-22 | Section hidden when listing has no embedding | P1 | `!ENABLE_SEMANTIC_SEARCH` |
| SS-23 | Section hidden when no similar above threshold | P1 | `!ENABLE_SEMANTIC_SEARCH` |
| SS-24 | SQL errors don't crash the page | P0 | None |
| SS-25 | Current listing excluded from similar | P0 | Section not visible |
| SS-26 | Only ACTIVE listings shown | P1 | Section not visible |
| SS-27 | At most 4 cards displayed | P2 | Section not visible |
| SS-56 | Show on map button is inert | P2 | Section not visible |
| SS-57 | FavoriteButton renders unsaved | P2 | Section not visible |
| SS-61 | Responsive layout (1 col mobile, 2 col desktop) | P2 | Section not visible |

### 3.4 `semantic-search-resilience.anon.spec.ts`

**Purpose**: Verify search gracefully degrades when backend subsystems fail.

| ID | Title | Priority | Skip Condition |
|----|-------|----------|----------------|
| SS-40 | Gemini API down — FTS fallback | P0 | None (env-agnostic) |
| SS-41 | Gemini API 401 — FTS fallback | P1 | None |
| SS-42 | SQL function error — FTS fallback | P0 | None |
| SS-55 | Missing GEMINI_API_KEY — graceful degradation | P1 | None |

**Note**: These tests cannot *induce* Gemini failures from E2E. They verify the *observable behavior*: search always returns results (or a graceful empty state), never crashes, no uncaught errors in console. The real failure injection is covered by unit/integration tests.

### 3.5 `semantic-search-cursor-reset.anon.spec.ts`

**Purpose**: Verify cursor/accumulated results reset on param change.

| ID | Title | Priority | Skip Condition |
|----|-------|----------|----------------|
| SS-58 | Changing search params resets accumulated results | P0 | `!ENABLE_SEMANTIC_SEARCH` |

### 3.6 `semantic-search-xss.anon.spec.ts`

**Purpose**: Verify XSS/injection sanitization in search.

| ID | Title | Priority | Skip Condition |
|----|-------|----------|----------------|
| SS-60 | HTML/script tags in query are sanitized | P2 | None |

---

## 4. Test Data Requirements

### 4.1 Seed Data (already exists)

The E2E test seed (via `global-setup.ts`) creates listings in the SF bounding box. These tests reuse that seed data.

### 4.2 Embedding Data

- **For activation tests (SS-01..SS-07)**: No special embedding data needed. Tests are environment-agnostic.
- **For results quality tests (SS-08..SS-12)**: Require listings with `embedding_status='COMPLETED'`. The `ENABLE_SEMANTIC_SEARCH=true` + `GEMINI_API_KEY` environment must have run the embedding sync. Tests skip when not available.
- **For similar listings tests (SS-20..SS-27)**: Require at least one listing with a completed embedding and similar neighbors above 0.3 threshold. Tests gracefully skip if "Similar listings" heading is not visible.

### 4.3 No New Test API Routes Required

All tests work through the standard UI. No new `test-helpers` actions needed.

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Embeddings not backfilled** in test env | High | Tests skip, low coverage | Use `test.skip()` with clear messages. Document setup requirements. |
| **Flaky card count assertions** (Load More timing) | Medium | False failures | Use `expect.poll()` with generous timeout for count assertions. |
| **Similar listings section absent** | High (if no embeddings) | 11 tests skip | Each test has independent skip guard. Document embedding backfill prereq. |
| **Dual container strict mode violations** | Low | Locator errors | Always scope to `searchResultsContainer(page)` per project convention. |
| **Slow CI server** | Medium | Timeout failures | All describes use `test.slow()` via `beforeEach`. Timeouts are 30s+ for card waits. |
| **Search returns 0 results** | Low | Assertion failures | Tests handle empty state gracefully — check for cards OR "no results" message. |
| **Console error noise** (mapbox, HMR, etc.) | High | False positive error checks | Reuse `BENIGN_ERROR_PATTERNS` from existing resilience tests. |
| **XSS test query URL-encoded differently** | Low | Script injection test miss | Use `encodeURIComponent` explicitly for the injection payload. |

---

## 6. Conventions & Patterns Summary

### Test Structure
```typescript
test.describe("Semantic Search - Category", () => {
  test.beforeEach(async () => { test.slow(); });

  test(`${tags.core} SS-XX: descriptive title`, async ({ page }) => {
    // Navigate
    // Wait for results
    // Assert observable behavior
  });
});
```

### Wait-for-results Pattern
```typescript
const container = searchResultsContainer(page);
const cards = container.locator('[data-testid="listing-card"]');
const cardOrEmpty = cards.first().or(page.getByText(/no (matches|results|listings)/i));
await expect(cardOrEmpty).toBeVisible({ timeout: 30_000 });
```

### Skip Pattern
```typescript
const SEMANTIC_ENABLED = process.env.ENABLE_SEMANTIC_SEARCH === 'true';
test.skip(!SEMANTIC_ENABLED, 'Requires ENABLE_SEMANTIC_SEARCH=true');
```

### Similar Listings Skip Pattern
```typescript
const heading = page.getByRole('heading', { name: 'Similar listings' });
const hasSection = await heading.isVisible({ timeout: 10_000 }).catch(() => false);
test.skip(!hasSection, 'Similar listings section not visible (embeddings may not be backfilled)');
```
