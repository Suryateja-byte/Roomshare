# P3 Audit Fixes + Test Coverage Gaps — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all remaining P3 Low audit items and close test coverage gaps identified in the production readiness audit.

**Architecture:** 6 parallel agents with non-overlapping file ownership. Each agent works independently on its domain (ARIA/a11y, cron/sitemap, backend fixes, search-v2 tests, component tests, test quality). All source changes are minimal; test files follow existing jest.setup.js patterns with mock Prisma client.

**Tech Stack:** Next.js 15 (App Router), Prisma, Jest, React Testing Library, Playwright, Sentry, PostGIS

---

## Agent 1: `aria-a11y-agent`

### Task 1.1: Add skip-to-search landmark link

**Files:**
- Modify: `src/app/layout.tsx` (or root layout)
- Modify: `src/components/search/SearchResultsClient.tsx` (add target id)

**Step 1: Add skip link to root layout**

Add as first child inside `<body>`:
```tsx
<a href="#search-results" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-blue-700 dark:focus:bg-zinc-900 dark:focus:text-blue-400">
  Skip to search results
</a>
```

**Step 2: Add target id to search results container**

In `SearchResultsClient.tsx`, find the results container div and add `id="search-results"`.

**Step 3: Verify — keyboard Tab from page load focuses skip link first**

**Step 4: Commit**
```bash
git add src/app/layout.tsx src/components/search/SearchResultsClient.tsx
git commit -m "a11y: add skip-to-search landmark link"
```

---

### Task 1.2: Fix Escape key conflicts between MobileBottomSheet, Map, and FilterModal

**Files:**
- Modify: `src/components/search/MobileBottomSheet.tsx`

**Step 1: Read current Escape handlers**

SearchForm uses `useKeyboardShortcuts` with `disabled: !showFilters` (good — only fires when filters open).
Map has Escape handler for popup dismiss.
MobileBottomSheet likely has its own Escape handler.

**Step 2: Add guard to MobileBottomSheet Escape handler**

Ensure the Escape handler in MobileBottomSheet only fires when no modal/dialog is open. Add a check:
```tsx
// Only handle Escape if no dialog is open (FilterModal, BookingForm, etc.)
const handleEscape = useCallback((e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    // Don't interfere with dialogs — they have their own Escape handling via FocusTrap
    const openDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (openDialog) return;
    // Collapse sheet to half position
    setSnapPoint('half');
  }
}, []);
```

**Step 3: Verify — open FilterModal on mobile, press Escape closes modal (not sheet)**

**Step 4: Commit**
```bash
git add src/components/search/MobileBottomSheet.tsx
git commit -m "a11y: fix Escape key conflict between bottom sheet and modals"
```

---

## Agent 2: `cron-sitemap-agent`

### Task 2.1: Add TypingStatus cleanup to cron infrastructure

**Files:**
- Create: `src/app/api/cron/cleanup-typing-status/route.ts`

**Step 1: Write the cron route**

Follow the pattern from `cleanup-rate-limits/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import * as Sentry from '@sentry/nextjs';
import { withRetry } from '@/lib/retry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || cronSecret.length < 32 || cronSecret.includes('change-in-production')) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const result = await withRetry(() =>
      prisma.typingStatus.deleteMany({
        where: { updatedAt: { lt: fiveMinutesAgo } },
      })
    );

    logger.sync.info('Typing status cleanup complete', { deleted: result.count });

    return NextResponse.json({
      success: true,
      deleted: result.count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    Sentry.captureException(error, { tags: { cron: 'cleanup-typing-status' } });
    logger.sync.error('Typing status cleanup failed', { error });
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
```

**Step 2: Add to vercel.json cron schedule (if exists) or document for deployment**

**Step 3: Write test**

Create `src/__tests__/api/cron/cleanup-typing-status.test.ts` following the `cleanup-rate-limits.test.ts` pattern.

**Step 4: Run test, verify pass**

**Step 5: Commit**
```bash
git add src/app/api/cron/cleanup-typing-status/ src/__tests__/api/cron/cleanup-typing-status.test.ts
git commit -m "feat: add TypingStatus TTL cleanup cron job"
```

---

### Task 2.2: Paginate sitemap for large-scale support

**Files:**
- Modify: `src/app/sitemap.ts`

**Step 1: Read current implementation**

Currently loads ALL active listings + users into memory via `unstable_cache`. Works fine for <50K URLs but will OOM at scale.

**Step 2: Add chunking with sitemap index pattern**

Next.js supports `generateSitemaps()` for sitemap indexes. Refactor:
```typescript
const URLS_PER_SITEMAP = 5000;

export async function generateSitemaps() {
  const [listingCount, userCount] = await Promise.all([
    prisma.listing.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { isSuspended: false } }),
  ]);

  const totalUrls = listingCount + userCount + 10; // +10 for static pages
  const sitemapCount = Math.ceil(totalUrls / URLS_PER_SITEMAP);

  return Array.from({ length: sitemapCount }, (_, i) => ({ id: i }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const offset = id * URLS_PER_SITEMAP;
  // ... fetch with skip/take and build URLs
}
```

**Step 3: Verify locally — `curl localhost:3000/sitemap.xml` returns sitemap index**

**Step 4: Commit**
```bash
git add src/app/sitemap.ts
git commit -m "perf: paginate sitemap with generateSitemaps for large-scale support"
```

---

## Agent 3: `backend-fixes-agent`

### Task 3.1: Fix ServiceWorker interval leak

**Files:**
- Modify: `src/components/ServiceWorkerRegistration.tsx`

**Step 1: Find the interval setup**

The component sets `setInterval(reg.update, 60 * 60 * 1000)` but never clears it.

**Step 2: Store interval ref and clear on unmount**

```tsx
useEffect(() => {
  let updateInterval: NodeJS.Timeout | null = null;

  // ... existing registration logic ...
  // Where interval is set:
  updateInterval = setInterval(() => reg.update(), 60 * 60 * 1000);

  return () => {
    if (updateInterval) clearInterval(updateInterval);
  };
}, []);
```

**Step 3: Commit**
```bash
git add src/components/ServiceWorkerRegistration.tsx
git commit -m "fix: clear ServiceWorker update interval on unmount"
```

---

### Task 3.2: Add Zod validation for SavedSearch.filters

**Files:**
- Modify: `src/app/actions/saved-search.ts` (or wherever SavedSearch is read/written)

**Step 1: Find SavedSearch read/write locations**

Grep for `SavedSearch` and `savedSearch` in actions/routes.

**Step 2: Add Zod schema for the filters JSON field**

```typescript
const savedSearchFiltersSchema = z.object({
  q: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  roomType: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  houseRules: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  moveInDate: z.string().optional(),
  leaseDuration: z.string().optional(),
  genderPreference: z.string().optional(),
}).passthrough(); // Allow future fields
```

**Step 3: Validate on write (safeParse), parse on read (with fallback to empty)**

**Step 4: Commit**
```bash
git commit -m "fix: add Zod validation for SavedSearch.filters JSON field"
```

---

### Task 3.3: Audit verify_listing.ts for PII

**Files:**
- Modify: `src/scripts/verify_listing.ts`

**Step 1: Read the file — check for console.log of user data**

The script queries listings and logs results. Ensure no email/phone/address is logged raw.

**Step 2: If PII found, redact or remove. If clean, add a comment noting it was audited.**

**Step 3: Commit**
```bash
git commit -m "sec: audit verify_listing script for PII exposure"
```

---

### Task 3.4: Verify SessionProvider polling is 300s

**Files:**
- Read: Provider component wrapping SessionProvider

**Step 1: Grep for `SessionProvider` and check `refetchInterval`**

Performance agent already verified this is 300s. Confirm and document.

**Step 2: If already 300s, no change needed. If not, update.**

---

## Agent 4: `search-v2-tests-agent`

### Task 4.1: Create search-v2-service test suite

**Files:**
- Create: `src/__tests__/lib/search/search-v2-service.test.ts`

**Step 1: Read `src/lib/search/search-v2-service.ts` to understand exports and dependencies**

Key function: `executeSearchV2(params)` — orchestrates list query, map query, ranking, transformation.

**Step 2: Write test file with comprehensive mocks**

```typescript
jest.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: jest.fn(), listing: { findMany: jest.fn() } },
}));
jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/logger', () => ({
  logger: { sync: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } },
}));
// Mock all sub-modules: data, ranking, transform, search-doc-queries

import { executeSearchV2 } from '@/lib/search/search-v2-service';

describe('search-v2-service', () => {
  describe('executeSearchV2', () => {
    it('returns paginated list results and map data', async () => { /* ... */ });
    it('handles map query timeout gracefully (returns list only)', async () => { /* ... */ });
    it('handles list query failure gracefully (returns empty)', async () => { /* ... */ });
    it('applies ranking when feature flag enabled', async () => { /* ... */ });
    it('skips ranking when feature flag disabled', async () => { /* ... */ });
    it('logs search_latency metrics', async () => { /* ... */ });
    it('respects pagination cursor', async () => { /* ... */ });
    it('returns geojson mode when mapCount > 30', async () => { /* ... */ });
  });
});
```

**Step 3: Run tests to verify they fail (red phase)**

```bash
pnpm jest src/__tests__/lib/search/search-v2-service.test.ts --verbose
```

**Step 4: Implement test bodies with proper mock data matching the service interface**

**Step 5: Run tests to verify they pass (green phase)**

**Step 6: Commit**
```bash
git add src/__tests__/lib/search/search-v2-service.test.ts
git commit -m "test: add comprehensive search-v2-service test suite"
```

---

## Agent 5: `component-tests-agent`

### Task 5.1: Create SearchV2DataContext test

**Files:**
- Create: `src/__tests__/contexts/SearchV2DataContext.test.tsx`

**Step 1: Write tests for selector hooks**

```tsx
import { renderHook } from '@testing-library/react';
import { SearchV2DataProvider, useV2MapData, useIsV2Enabled, useDataVersion } from '@/contexts/SearchV2DataContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SearchV2DataProvider>{children}</SearchV2DataProvider>
);

describe('SearchV2DataContext', () => {
  it('provides default values', () => {
    const { result } = renderHook(() => useIsV2Enabled(), { wrapper });
    expect(result.current).toBeDefined();
  });

  it('useV2MapData returns map data', () => { /* ... */ });
  it('useDataVersion increments on data change', () => { /* ... */ });
});
```

**Step 2: Run, verify pass**

**Step 3: Commit**

---

### Task 5.2: Create MobileSearchContext test

**Files:**
- Create: `src/__tests__/contexts/MobileSearchContext.test.tsx`

Test: `expand()`, `collapse()`, `isExpanded` state, `openFilters()` callback registration.

---

### Task 5.3: Create FilterModal test

**Files:**
- Create: `src/__tests__/components/search/FilterModal.test.tsx`

Test: renders with `role="dialog"`, `aria-modal="true"`, close button has `aria-label`, amenity toggles have `aria-pressed`, onApply fires with selected filters.

---

### Task 5.4: Create ErrorBoundary test

**Files:**
- Create: `src/__tests__/components/error/ErrorBoundary.test.tsx`

Test: renders children normally, catches errors and shows fallback with `role="alert"`, "Try again" button resets error state, Sentry.captureException called.

---

## Agent 6: `test-quality-agent`

### Task 6.1: Fix global.fetch mock pattern

**Files:**
- Modify: `src/__tests__/security/email-linking.test.ts` (and any others using `global.fetch = jest.fn()`)

**Step 1: Find all files using the pattern**

```bash
grep -r "global.fetch = jest.fn()" src/__tests__/
```

**Step 2: Replace with scoped mock**

Instead of `global.fetch = jest.fn()`, use:
```typescript
const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
  new Response(JSON.stringify({ ok: true }), { status: 200 })
);

afterEach(() => {
  fetchSpy.mockRestore();
});
```

**Step 3: Run affected tests, verify pass**

**Step 4: Commit**
```bash
git commit -m "test: replace global.fetch assignment with jest.spyOn pattern"
```

---

### Task 6.2: Improve $transaction mock in jest.setup.js

**Files:**
- Modify: `jest.setup.js` (lines ~209-211)

**Step 1: Read current mock**

```javascript
mockPrismaClient.$transaction = jest.fn((fn) =>
  typeof fn === 'function' ? fn(mockPrismaClient) : Promise.all(fn)
);
```

This passes the full mock client — which is correct. The audit said "passes empty object" but the current code passes `mockPrismaClient`. Verify this is actually a problem or already fixed.

**Step 2: If already correct, document with a comment. If wrong, fix.**

Add clarifying comment:
```javascript
// Interactive transactions receive the full mock client as `tx` param
// Array transactions resolve with Promise.all
mockPrismaClient.$transaction = jest.fn((fn) =>
  typeof fn === 'function' ? fn(mockPrismaClient) : Promise.all(fn)
);
```

**Step 3: Commit**

---

### Task 6.3: Add timezone edge case tests

**Files:**
- Create: `src/__tests__/edge-cases/timezone-edge-cases.test.ts`

**Step 1: Write test suite**

```typescript
describe('Timezone edge cases', () => {
  describe('booking date boundaries', () => {
    it('handles DST spring-forward (March) correctly', () => { /* ... */ });
    it('handles DST fall-back (November) correctly', () => { /* ... */ });
    it('handles UTC midnight boundary', () => { /* ... */ });
  });

  describe('date display formatting', () => {
    it('formats dates consistently regardless of browser timezone', () => { /* ... */ });
    it('handles ISO date strings without timezone offset', () => { /* ... */ });
  });

  describe('search date filters', () => {
    it('moveInDate filter works across timezone boundaries', () => { /* ... */ });
  });
});
```

**Step 2: Run, verify pass**

**Step 3: Commit**
```bash
git commit -m "test: add timezone edge case test suite"
```

---

## Verification Checklist

After all agents complete:
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all suites)
- [ ] `pnpm lint` passes (or only pre-existing issues)
- [ ] No new files outside agent ownership boundaries
- [ ] All new test files follow existing patterns (jest.setup.js mocks)
- [ ] Commit messages follow conventional commits format
