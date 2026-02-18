# Master Execution Spec — Production Readiness Remediation

**Generated**: 2026-02-17
**Source**: SEARCH_PAGE_PRODUCTION_AUDIT.md (130+ findings)
**Scope**: Sprint 1 — Issues C1–C9, H1–H5 (14 issues total)

---

## Sprint Plan Overview (All 130+ Issues)

### Sprint 1: Security, SEO & Reliability (THIS DOCUMENT)
**Issues**: C1–C9, H1–H5 (14 issues)
**Theme**: Fix everything that can cause data exfiltration, server hangs, WCAG failures, or user-triggered 500s.

| Priority | Issues | Domain |
|----------|--------|--------|
| P0-Critical | C1, C2, C3, C4, C5, C6, C7, C8, C9 | SEO, Security, A11y, Reliability |
| P1-High | H1, H2, H3, H4, H5 | Input validation, Timeouts, Constants |

### Sprint 2: API Hardening & Rate Limiting
**Issues**: H6–H12, H19–H21, M35–M39
**Theme**: Timeout protection for facets, rate limit consistency, saved search abuse prevention, cursor tampering fallout.

### Sprint 3: Client/UX Consistency & Filter Parity
**Issues**: H12–H16, H21, M20–M29, M40–M44
**Theme**: Filter param format alignment, filter count divergence, memoization, performance marks cleanup.

### Sprint 4: Map & Infrastructure
**Issues**: H17–H18, M30–M34, L21–L24
**Theme**: Remove duplicate MapClient, marker limits, WebGL improvements, console cleanup.

### Sprint 5: Polish & Low-Priority
**Issues**: L1–L20, L25–L32, remaining M-tier
**Theme**: Accessibility polish, hardcoded values, CORS, caching, code cleanup.

---

## Sprint 1: Master Execution Spec

### Dependency Graph

```
C4 (HMAC cursors) ── standalone, no deps
C3 ($queryRawUnsafe) ── standalone, no deps
H2 (query length) ── standalone, no deps
C1 (SEO metadata) ── standalone, no deps
H5 (centralize constant) ─┐
C2 (fetchMore timeout) ───┤── H5 should land first (changes same file)
H4 (filterImpact timeout) ┘
H1 (no-throw parse) ── must update tests + listings route
H3 (429 in middleware) ── touches middleware.ts + page.tsx
C5+C6+C7+C8 (SaveSearch a11y) ── all in same file, do together
C9 (WebGL recovery) ── standalone
```

### Recommended Implementation Order

```
Batch 1 (parallel — no cross-dependencies):
  ├── C4: HMAC cursor signing
  ├── C3: $queryRawUnsafe guardrails
  ├── H2: Query length cap
  └── C1: generateMetadata for SEO

Batch 2 (sequential — shared files):
  ├── H5: Centralize ITEMS_PER_PAGE → DEFAULT_PAGE_SIZE
  ├── C2: Wrap fetchMoreListings in withTimeout
  └── H4: Wrap analyzeFilterImpact in withTimeout

Batch 3 (parallel — independent):
  ├── H1: Remove throws from parseSearchParams
  ├── H3: Move rate limit to middleware (429)
  └── C5+C6+C7+C8: SaveSearchButton a11y bundle

Batch 4:
  └── C9: WebGL context loss recovery
```

---

## Fix Specifications

---

### C1 — No `generateMetadata` — Zero SEO on Search Page

| Field | Value |
|-------|-------|
| **Target File** | `src/app/search/page.tsx` |
| **Severity** | CRITICAL — no organic discovery without this |
| **New Dependencies** | None |
| **Env Vars** | None |

**The "Why":** The search page has zero SEO — no title, description, canonical URL, or OG tags. Every filter combination indexes as duplicate content with a generic title.

**The "How" (Logic Diff):**

1. Import `Metadata` type from `'next'` at the top of the file.

2. Export `generateMetadata` async function before the default page export (~line 68). It receives `{ searchParams }` with the same shape as the page component.

3. Inside `generateMetadata`:
   - `await searchParams`, then call `parseSearchParams(rawParams)` to extract `q` and `filterParams`. No DB queries — pure param derivation only.
   - Build `title`:
     - With query: `"Rooms for rent in ${q} | Roomshare"`
     - Browse mode: `"Find Rooms & Roommates | Roomshare"`
   - Build `description`:
     - Base: `"Browse ${q ? q + ' ' : ''}room listings on Roomshare."`
     - Append filter summary (price range, roomType). Cap at 160 chars via `.substring(0, 160)`.
   - Return `Metadata` object:
     ```
     {
       title,
       description,
       openGraph: { title, description, type: 'website' },
       alternates: { canonical: `/search${q ? `?q=${encodeURIComponent(q)}` : ''}` }
     }
     ```
     Canonical strips filter/pagination params to avoid duplicate indexing.

4. **Pattern reference**: Matches `src/app/users/[id]/page.tsx:7–22` and `src/app/listings/[id]/page.tsx:13–36`.

**Cross-File Impact:** None. Purely additive export.

---

### C2 — `fetchMoreListings` Server Action Has No Timeout

| Field | Value |
|-------|-------|
| **Target File** | `src/app/search/actions.ts` |
| **Severity** | CRITICAL — can hang entire server |
| **New Dependencies** | None |
| **Env Vars** | None |

**The "Why":** The `executeSearchV2()` call at line 52 has no `withTimeout` wrapper, unlike the SSR page which wraps both V2 and V1 paths. A hung DB exhausts Node.js worker threads.

**The "How" (Logic Diff):**

1. Add import at top:
   ```ts
   import { withTimeout, DEFAULT_TIMEOUTS } from '@/lib/timeout-wrapper';
   ```

2. At line 52, wrap the call:
   ```
   // BEFORE:
   const v2Result = await executeSearchV2({ rawParams: rawParamsForV2, limit: ITEMS_PER_PAGE });

   // AFTER:
   const v2Result = await withTimeout(
     executeSearchV2({ rawParams: rawParamsForV2, limit: DEFAULT_PAGE_SIZE }),
     DEFAULT_TIMEOUTS.DATABASE,
     'fetchMoreListings-executeSearchV2'
   );
   ```
   Note: Uses `DEFAULT_PAGE_SIZE` per H5 fix.

3. Existing catch block at line 64 already handles all errors (falls through to V1 fallback). `TimeoutError` extends `Error`, so it is caught automatically — no new catch arm needed.

**Cross-File Impact:** None. Depends on H5 landing first (same file, `ITEMS_PER_PAGE` → `DEFAULT_PAGE_SIZE`).

---

### C3 — `$queryRawUnsafe` Used Extensively

| Field | Value |
|-------|-------|
| **Target Files** | `src/lib/search/search-doc-queries.ts`, `src/app/api/search/facets/route.ts` |
| **Severity** | CRITICAL — fragile SQL construction pattern |
| **New Dependencies** | None |
| **Env Vars** | None |

**The "Why":** While currently safe (all values are parameterized via `$N` placeholders), the `$queryRawUnsafe` function name provides no guardrail if a future developer accidentally concatenates user input into the SQL template string.

**The "How" (Logic Diff):**

**Immediate fix (defense-in-depth):**

1. In `search-doc-queries.ts` at the `queryWithTimeout` function (line 47), add a contract comment block:
   ```
   /**
    * SECURITY INVARIANT: `query` must contain ONLY hard-coded SQL template strings.
    * ALL user-supplied values MUST be in the `params` array as $N placeholders.
    * NEVER interpolate a value from filterParams directly into the query string.
    */
   ```

2. In both `buildSearchDocWhereConditions` (search-doc-queries.ts ~line 355) and `buildFacetWhereConditions` (facets/route.ts ~line 93), after `conditions.join(" AND ")`, add a dev-only runtime assertion:
   ```ts
   if (process.env.NODE_ENV !== 'production') {
     const suspiciousPattern = /(['"])[^$\d][^'"]*\1/;
     if (suspiciousPattern.test(whereClause)) {
       throw new Error('SECURITY: Raw string detected in whereClause — use parameterized $N placeholders');
     }
   }
   ```

3. In `facets/route.ts` for each of the 5 facet functions (lines 274, 310, 346, 380, 437), add the same contract comment above each `$queryRawUnsafe` call.

**Cross-File Impact:**

| File | Change |
|------|--------|
| `src/lib/search/search-doc-queries.ts:47` | Add security invariant comment to `queryWithTimeout` |
| `src/lib/search/search-doc-queries.ts:~355` | Add dev-only assertion after WHERE clause join |
| `src/app/api/search/facets/route.ts:~93` | Add dev-only assertion after WHERE clause join |
| `src/app/api/search/facets/route.ts:274,310,346,380,437` | Add contract comments above each `$queryRawUnsafe` call |

---

### C4 — No Cursor Signature/HMAC — Data Exfiltration Risk

| Field | Value |
|-------|-------|
| **Target Files** | `src/lib/search/cursor.ts` (primary), `src/lib/search/hash.ts`, `src/lib/env.ts` |
| **Severity** | CRITICAL — enables listing enumeration |
| **New Dependencies** | None (Node.js `crypto` built-in) |
| **Env Vars** | `CURSOR_SECRET` — 32+ byte hex string (generate with `openssl rand -hex 32`) |

**The "Why":** Keyset cursors are base64-encoded JSON containing raw sort column values. An attacker can decode, modify, and re-encode them to enumerate listings in arbitrary order, bypassing pagination intent.

**The "How" (Logic Diff):**

1. **Add env var** — In `src/lib/env.ts`:
   ```ts
   export const CURSOR_SECRET = process.env.CURSOR_SECRET ?? "";
   if (!CURSOR_SECRET && process.env.NODE_ENV === 'production') {
     console.error('[SECURITY] CURSOR_SECRET is not set — cursor HMAC disabled');
   }
   ```
   Add `CURSOR_SECRET=""` to `.env.example`.

2. **Sign cursors** — In `src/lib/search/cursor.ts`, modify `encodeKeysetCursor`:
   - Import `{ createHmac, timingSafeEqual }` from `"crypto"` and `CURSOR_SECRET` from `@/lib/env`.
   - After `JSON.stringify(cursor)`, compute HMAC:
     ```
     const sig = CURSOR_SECRET
       ? createHmac('sha256', CURSOR_SECRET).update(payload).digest('base64url')
       : null;
     const envelope = sig ? JSON.stringify({ p: payload, s: sig }) : payload;
     return toBase64Url(envelope);
     ```

3. **Verify cursors** — In `decodeKeysetCursor`:
   - Decode the base64, attempt to parse as signed envelope `{ p, s }`.
   - If `CURSOR_SECRET` is set and envelope has `s` field: compute expected HMAC, compare with `timingSafeEqual` (with length guard). Reject on mismatch.
   - If `CURSOR_SECRET` is set but no `s` field: reject (unsigned cursor in signed mode).
   - If no `CURSOR_SECRET` (dev): accept unsigned cursors as-is.
   - Extract `payloadStr` from `p` field, then parse as before.

4. **Legacy cursor in hash.ts** (lines 112–133) — Apply same HMAC envelope pattern to `encodeCursor`/`decodeCursor`. Lower priority since payload is just a page number (1–100).

5. **No changes needed** in `decodeLegacyCursor`, `decodeCursorAny`, `encodeStack`, or `decodeStack` — the signing is encapsulated at the individual cursor encode/decode level.

**Cross-File Impact:**

| File | Change |
|------|--------|
| `src/lib/search/cursor.ts` | Add HMAC signing to `encodeKeysetCursor`, verification to `decodeKeysetCursor` |
| `src/lib/search/hash.ts:112-133` | Mirror HMAC pattern for legacy cursor (lower priority) |
| `src/lib/env.ts` | Export `CURSOR_SECRET` |
| `.env.example` | Add `CURSOR_SECRET=""` |
| `src/lib/search/search-v2-service.ts` | No change — fix is encapsulated in cursor.ts |
| `src/lib/search/search-doc-queries.ts` | No change — cursor decoded via cursor.ts |

---

### C5 — SaveSearchButton Modal: No Focus Trap

| Field | Value |
|-------|-------|
| **Target File** | `src/components/SaveSearchButton.tsx` |
| **Severity** | CRITICAL — WCAG 2.1 AA failure |
| **New Dependencies** | None — `FocusTrap` component already exists at `src/components/ui/FocusTrap.tsx` |

**The "Why":** When the modal opens, Tab key escapes to background content behind the backdrop. Screen reader and keyboard users can interact with hidden page elements.

**The "How" (Logic Diff):**

1. Import the existing `FocusTrap` from `'@/components/ui/FocusTrap'`.

2. Wrap the modal content (lines 144–271, inside `{isOpen && (...)}`) with:
   ```tsx
   <FocusTrap active={isOpen} returnFocus={true}>
     {/* existing backdrop div + modal content div */}
   </FocusTrap>
   ```

3. Add Escape key handler effect:
   ```ts
   useEffect(() => {
     if (!isOpen) return;
     const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
     document.addEventListener('keydown', handler);
     return () => document.removeEventListener('keydown', handler);
   }, [isOpen]);
   ```
   Pattern reference: `MobileSearchOverlay.tsx:43–50`.

**Cross-File Impact:** None. `FocusTrap` used as-is. `MobileBottomSheet` checks `data-focus-trap` before handling Escape — compatible.

---

### C6 — SaveSearchButton Modal: Missing ARIA Attributes

| Field | Value |
|-------|-------|
| **Target File** | `src/components/SaveSearchButton.tsx` |
| **Severity** | CRITICAL — screen readers cannot identify dialog |

**The "Why":** The modal div has no `role`, `aria-modal`, or `aria-labelledby`. Screen readers don't announce it as a dialog.

**The "How" (Logic Diff):**

1. On the modal content div (line 153, the `relative bg-white rounded-2xl...` div), add:
   - `role="dialog"`
   - `aria-modal="true"`
   - `aria-labelledby="save-search-dialog-title"`

2. On the `<h2>` at line 161, add `id="save-search-dialog-title"`.

3. On the close button (line 154, X icon), add `aria-label="Close save search dialog"`.

4. On the backdrop div (line 147), add `aria-hidden="true"`. Pattern: `MobileBottomSheet.tsx:297`.

**Cross-File Impact:** None.

---

### C7 — SaveSearchButton Toggle: Missing ARIA Role

| Field | Value |
|-------|-------|
| **Target File** | `src/components/SaveSearchButton.tsx` |
| **Severity** | CRITICAL — toggle state invisible to assistive tech |

**The "Why":** The email alerts toggle button (lines 196–206) has no `role="switch"` or `aria-checked`. Screen readers announce it as a plain button.

**The "How" (Logic Diff):**

1. On the `<button>` at line 196, add:
   - `role="switch"`
   - `aria-checked={alertEnabled}`
   - `aria-label="Email alerts"`

2. On the `<span>` thumb (lines 202–205), add `aria-hidden="true"`.

**Cross-File Impact:** None.

---

### C8 — SaveSearchButton Modal: Body Scroll Not Locked

| Field | Value |
|-------|-------|
| **Target File** | `src/components/SaveSearchButton.tsx` |
| **Severity** | CRITICAL — mobile UX: content scrolls behind modal |

**The "Why":** Unlike `MobileSearchOverlay` and `MobileBottomSheet` which lock body scroll, the SaveSearch modal allows background scroll on mobile.

**The "How" (Logic Diff):**

Add `useEffect` matching `MobileSearchOverlay.tsx:52–60`:
```ts
useEffect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }
}, [isOpen]);
```

**Cross-File Impact:** None. Both modal and bottom sheet set/restore `overflow` independently — they are mutually exclusive (modal backdrop captures pointer events).

---

### C9 — No WebGL Context Loss Recovery

| Field | Value |
|-------|-------|
| **Target Files** | `src/components/Map.tsx`, `src/components/map/MapErrorBoundary.tsx` |
| **Severity** | CRITICAL — blank map after mobile backgrounding |
| **New Dependencies** | None (native browser API) |

**The "Why":** `webglcontextlost` fires when the OS reclaims GPU memory (mobile backgrounding). Without a handler, the map canvas goes blank permanently.

**The "How" (Logic Diff):**

**Part A — Map.tsx: Add WebGL listeners in `onLoad` callback (~line 1650)**

1. Declare `webglCleanupRef = useRef<(() => void) | null>(null)` near other refs (~line 424).

2. Inside `onLoad`, after `setIsMapLoaded(true)`:
   ```ts
   const canvas = mapRef.current?.getMap().getCanvas();
   if (canvas) {
     const handleContextLost = (e: Event) => {
       e.preventDefault(); // Required: tells browser to attempt restore
       console.warn('[Map] WebGL context lost');
     };
     const handleContextRestored = () => {
       console.warn('[Map] WebGL context restored');
       setIsMapLoaded(false);
       setTimeout(() => { if (isMountedRef.current) setIsMapLoaded(true); }, 0);
     };
     canvas.addEventListener('webglcontextlost', handleContextLost);
     canvas.addEventListener('webglcontextrestored', handleContextRestored);
     webglCleanupRef.current = () => {
       canvas.removeEventListener('webglcontextlost', handleContextLost);
       canvas.removeEventListener('webglcontextrestored', handleContextRestored);
     };
   }
   ```

3. In the unmount cleanup effect (near `isMountedRef.current = false`), call `webglCleanupRef.current?.()`.

**Part B — MapErrorBoundary.tsx: Distinguish WebGL errors**

1. Add `errorMessage?: string` to `State` interface.
2. In `getDerivedStateFromError(error)`, return `{ hasError: true, errorMessage: error.message }`.
3. In fallback render, show `"Map context lost — try refreshing"` when `errorMessage` contains `'webgl'` or `'context'` (case-insensitive), otherwise show current message.

**Cross-File Impact:**

| File | Change |
|------|--------|
| `src/components/PersistentMapWrapper.tsx` | None — `MapErrorBoundary` wrapping at lines 669–673 already provides recovery surface |
| `src/__tests__/components/map/MapErrorBoundary.test.tsx` | Add one test: throw error with `'webgl'` in message, assert fallback subtitle |

---

### H1 — `parseSearchParams` Throws on Malformed Input

| Field | Value |
|-------|-------|
| **Target Files** | `src/lib/search-params.ts`, `src/app/api/listings/route.ts` |
| **Severity** | HIGH — user-craftable 500 errors |
| **Tests to Update** | `search-params.test.ts` (2 assertions), `listings.test.ts` (1 assertion) |

**The "Why":** `parseSearchParams` throws on inverted price/lat ranges. Since most callers lack try/catch, this crashes the SSR page with a user-craftable URL like `?minPrice=5000&maxPrice=100`.

**The "How" (Logic Diff):**

**Site 1 — Price inversion (lines 429–435):**
Replace `throw new Error("minPrice cannot exceed maxPrice")` with:
```ts
let effectiveMinPrice = validMinPrice;
let effectiveMaxPrice = validMaxPrice;
if (effectiveMinPrice !== undefined && effectiveMaxPrice !== undefined && effectiveMinPrice > effectiveMaxPrice) {
  effectiveMinPrice = undefined;
  effectiveMaxPrice = undefined;
}
```
Use `effectiveMinPrice`/`effectiveMaxPrice` in `filterParams` construction (~line 534).

**Site 2 — Lat inversion (lines 445–451):**
Replace `throw new Error("minLat cannot exceed maxLat")` with:
```ts
let effectiveMinLat = validMinLat;
let effectiveMaxLat = validMaxLat;
if (effectiveMinLat !== undefined && effectiveMaxLat !== undefined && effectiveMinLat > effectiveMaxLat) {
  effectiveMinLat = undefined;
  effectiveMaxLat = undefined;
}
```
Use `effectiveMinLat`/`effectiveMaxLat` in bounds construction (~line 471).

**Cleanup — listings route:**
In `src/app/api/listings/route.ts`, the `isUserError` helper that catches `"cannot exceed"` message becomes dead code. Remove that branch.

**Test updates:**
- `search-params.test.ts:114–118`: Change `expect(() => ...).toThrow()` → `expect(result.filterParams.minPrice).toBeUndefined()`.
- `search-params.test.ts:343–353`: Change `expect(() => ...).toThrow()` → `expect(result.filterParams.bounds).toBeUndefined()`.
- `listings.test.ts:217–218`: Remove or update the `"cannot exceed"` string check.

**Cross-File Impact:**

| Caller | File | Impact |
|--------|------|--------|
| SearchPage (SSR) | `page.tsx:125` | No longer crashes — gets empty filter |
| executeSearchV2 | `search-v2-service.ts:106` | Parse succeeds |
| SaveSearchButton | `SaveSearchButton.tsx:51` | No longer unhandled rejection |
| GET /api/listings | `listings/route.ts:31` | Remove dead `isUserError` branch |
| GET /api/search-count | `search-count/route.ts:52` | No longer triggers 500 |
| GET /api/search/facets | `facets/route.ts:536` | No longer triggers 500 |

---

### H2 — No Query Length Validation in `parseSearchParams`

| Field | Value |
|-------|-------|
| **Target File** | `src/lib/search-params.ts` |
| **Severity** | HIGH — memory/DoS abuse vector |
| **New Dependencies** | None |

**The "Why":** `raw.q` is trimmed but not length-capped. Arbitrarily long strings propagate into `plainto_tsquery()` causing CPU-intensive text search, and inflate cache key size.

**The "How" (Logic Diff):**

1. Add `MAX_QUERY_LENGTH` to the existing import from `./constants` (line 3):
   ```ts
   import { MAX_SAFE_PRICE, MAX_SAFE_PAGE, MAX_ARRAY_ITEMS, MAX_QUERY_LENGTH, LAT_OFFSET_DEGREES } from "./constants";
   ```

2. At lines 404–406, replace:
   ```ts
   const rawQuery = getFirstValue(raw.q);
   const query = rawQuery ? rawQuery.trim() : "";
   const q = query || undefined;
   ```
   With:
   ```ts
   const rawQuery = getFirstValue(raw.q);
   const trimmed = rawQuery ? rawQuery.trim() : "";
   const query = trimmed.length > MAX_QUERY_LENGTH ? trimmed.slice(0, MAX_QUERY_LENGTH) : trimmed;
   const q = query || undefined;
   ```
   Silent truncation matches the existing `safeParseInt` clamping pattern in the same function.

**Cross-File Impact:** None. All downstream consumers (facets, search-doc-queries) go through `parseSearchParams`.

---

### H3 — Rate-Limited Pages Return HTTP 200 Instead of 429

| Field | Value |
|-------|-------|
| **Target Files** | `src/middleware.ts`, `src/app/search/page.tsx` |
| **Severity** | HIGH — bots see 200 and keep hammering |

**The "Why":** Server Components cannot set HTTP status codes. The rate-limited JSX returns as HTTP 200, invisible to clients, bots, and monitoring.

**The "How" (Logic Diff):**

**Move rate limiting to middleware (architecturally correct — middleware can set status codes):**

1. In `src/middleware.ts`, after the suspension check (~line 10) and before CSP headers:
   ```ts
   import { checkServerComponentRateLimit } from '@/lib/with-rate-limit';
   import { NextResponse } from 'next/server';

   // Rate limit /search page requests
   if (request.nextUrl.pathname === '/search') {
     const rateLimitResult = await checkServerComponentRateLimit(
       request.headers, 'search', '/search'
     );
     if (!rateLimitResult.allowed) {
       return new NextResponse('Too Many Requests', {
         status: 429,
         headers: {
           'Retry-After': String(rateLimitResult.retryAfter ?? 60),
           'Content-Type': 'text/plain',
         },
       });
     }
   }
   ```

2. In `src/app/search/page.tsx`, remove lines 98–120 (the entire rate limit check + JSX return block). Remove the `checkServerComponentRateLimit` import if no longer used. Remove the `Clock` import from `lucide-react` if only used in that block.

**Cross-File Impact:**

| File | Change |
|------|--------|
| `src/middleware.ts` | Add rate limit gate for `/search` |
| `src/app/search/page.tsx` | Remove rate limit block (lines 98–120), clean up unused imports |
| `src/app/search/actions.ts` | No change — server action rate limiting is separate and correct |

---

### H4 — `analyzeFilterImpact` Called Without Timeout

| Field | Value |
|-------|-------|
| **Target File** | `src/app/search/page.tsx` |
| **Severity** | HIGH — SSR hangs on zero-results path |

**The "Why":** `analyzeFilterImpact` runs multiple parallel COUNT queries with no timeout, blocking SSR indefinitely on the zero-results page.

**The "How" (Logic Diff):**

At line 255, replace:
```ts
const filterSuggestions = hasConfirmedZeroResults ? await analyzeFilterImpact(filterParams) : [];
```
With:
```ts
const filterSuggestions = hasConfirmedZeroResults
  ? await withTimeout(
      analyzeFilterImpact(filterParams),
      DEFAULT_TIMEOUTS.DATABASE,
      'analyzeFilterImpact'
    ).catch(() => [] as FilterSuggestion[])
  : [];
```

- `withTimeout` and `DEFAULT_TIMEOUTS` are already imported (line 21).
- `.catch(() => [])` provides graceful degradation — filter suggestions are non-critical UI enrichment. Pattern matches `savedPromise.catch(() => [])` at line 238.
- Verify `FilterSuggestion` type is in the import from `@/lib/data` (line 2). If not, add it.

**Cross-File Impact:** None.

---

### H5 — `ITEMS_PER_PAGE` Duplicated Instead of Centralized Constant

| Field | Value |
|-------|-------|
| **Target Files** | `src/app/search/page.tsx`, `src/app/search/actions.ts` |
| **Severity** | HIGH — silent divergence risk for pagination |

**The "Why":** Both files define `const ITEMS_PER_PAGE = 12` locally instead of importing `DEFAULT_PAGE_SIZE` from `src/lib/constants.ts`. If either drifts, SSR and "Load more" return different page sizes, causing duplicate or skipped listings.

**The "How" (Logic Diff):**

**In `src/app/search/page.tsx`:**
1. Remove line 23: `const ITEMS_PER_PAGE = 12;`
2. Add: `import { DEFAULT_PAGE_SIZE } from '@/lib/constants';`
3. Replace `ITEMS_PER_PAGE` usages (lines ~190, ~231) with `DEFAULT_PAGE_SIZE`.

**In `src/app/search/actions.ts`:**
1. Remove line 10: `const ITEMS_PER_PAGE = 12;`
2. Add: `import { DEFAULT_PAGE_SIZE } from '@/lib/constants';`
3. Replace `ITEMS_PER_PAGE` usage (line ~54) with `DEFAULT_PAGE_SIZE`.

**Cross-File Impact:** None beyond the two files. `src/lib/filter-schema.ts` already correctly imports `DEFAULT_PAGE_SIZE`.

---

## Global Cross-File Impact Matrix

This table shows every source file touched across all 14 fixes, with the specific fixes that modify it.

| File | Fixes | Notes |
|------|-------|-------|
| `src/app/search/page.tsx` | C1, H3, H4, H5 | Most-touched file — implement H5 first, then C1/H4, then H3 |
| `src/app/search/actions.ts` | C2, H5 | H5 first (removes local constant), then C2 (adds timeout) |
| `src/components/SaveSearchButton.tsx` | C5, C6, C7, C8 | All four fixes in single pass |
| `src/components/Map.tsx` | C9 | WebGL listeners in onLoad |
| `src/components/map/MapErrorBoundary.tsx` | C9 | WebGL-specific error message |
| `src/lib/search-params.ts` | H1, H2 | H2 is 2-line change; H1 is larger (remove throws) |
| `src/lib/search/cursor.ts` | C4 | HMAC encode/decode |
| `src/lib/search/hash.ts` | C4 | Legacy cursor HMAC (lower priority) |
| `src/lib/search/search-doc-queries.ts` | C3 | Security invariant comments |
| `src/app/api/search/facets/route.ts` | C3 | Security invariant comments + dev assertion |
| `src/app/api/listings/route.ts` | H1 | Remove dead `isUserError` branch |
| `src/middleware.ts` | H3 | Add rate limit gate for /search |
| `src/lib/env.ts` | C4 | Export CURSOR_SECRET |
| `.env.example` | C4 | Add CURSOR_SECRET entry |

---

## Test Impact Summary

| Fix | Tests to Update | Tests to Add |
|-----|----------------|--------------|
| C1 | None | Optional: test `generateMetadata` returns title with query |
| C2 | None | Optional: mock slow executeSearchV2, verify V1 fallback |
| C3 | None | None (dev-only assertion) |
| C4 | Cursor encode/decode tests must handle signed envelope | Add: test signed cursor roundtrip, test tampered cursor rejection |
| C5 | None | Add: test focus moves into modal on open, returns on close |
| C6 | None | None (attribute additions) |
| C7 | None | None (attribute additions) |
| C8 | None | None |
| C9 | None | Add: MapErrorBoundary test with 'webgl' error message |
| H1 | `search-params.test.ts` — 2 `toThrow` assertions → undefined checks | None |
| H2 | None | Optional: test query longer than 200 is truncated |
| H3 | None | Optional: middleware test for 429 on /search |
| H4 | None | None |
| H5 | None | None |

---

## Environment Variables Checklist

| Variable | Required By | Value | Where to Set |
|----------|-------------|-------|-------------|
| `CURSOR_SECRET` | C4 | 32+ byte hex (e.g., `openssl rand -hex 32`) | Vercel env vars, `.env.local` |

---

## Verification Checklist (Post-Implementation)

```
[ ] pnpm lint — passes
[ ] pnpm typecheck — passes
[ ] pnpm test — passes (with updated assertions for H1)
[ ] Manual: visit /search — has <title>, <meta description>, OG tags (C1)
[ ] Manual: /search?minPrice=5000&maxPrice=100 — no error page (H1)
[ ] Manual: /search with very long ?q= — truncated, no error (H2)
[ ] Manual: open Save Search modal → Tab key stays inside (C5)
[ ] Manual: Save Search modal → screen reader announces dialog (C6)
[ ] Manual: toggle switch → screen reader announces on/off (C7)
[ ] Manual: Save Search modal on mobile → background doesn't scroll (C8)
[ ] Manual: craft tampered cursor base64 → 400 or falls to page 1 (C4)
[ ] Load test: "Load more" with simulated slow DB → times out, falls to V1 (C2)
[ ] Verify: /search rate limit returns HTTP 429, not 200 (H3)
```
