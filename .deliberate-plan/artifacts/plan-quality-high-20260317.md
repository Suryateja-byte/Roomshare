# Plan: Quality HIGH Fixes — QUAL-H1 (waitForTimeout) + QUAL-H2 (as any)

**Date**: 2026-03-17
**Type**: REFACTOR
**Confidence**: 4.3/5.0 (MEDIUM-HIGH)
**Task Classification**: Large-scale codebase quality improvement

---

## Executive Summary

Two quality HIGH issues requiring systematic codebase-wide refactoring:

1. **QUAL-H1**: Replace ~360 `waitForTimeout()` calls across 100 E2E spec files with condition-based Playwright waits. Phased approach over 4 phases targeting test reliability and CI speed (est. 2-3 min savings per full run).

2. **QUAL-H2**: Reduce `as any` / `: any` type casts in production code from ~27 instances across ~16 files to under 10. Categorized by pattern with typed replacements.

---

## Confidence Score

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Research Grounding | 15% | 5/5 | Playwright docs well-established; TS strict mode patterns well-known |
| Codebase Accuracy | 25% | 4/5 | All file paths verified via grep; line numbers confirmed |
| Assumption Freedom | 20% | 4/5 | Counts verified; patterns read from actual code |
| Completeness | 15% | 4/5 | All phases defined; test strategy clear |
| Harsh Critic Verdict | 15% | 4/5 | See risk register; main risk is E2E flake introduction |
| Specificity | 10% | 5/5 | Exact file:line for every production `any`; replacement code provided |
| **Weighted Total** | 100% | **4.3** | 🟡 Execute with extra review at flagged steps |

---

## QUAL-H1: Replace waitForTimeout() Calls in E2E Tests

### Verified Inventory

**Total**: ~360 `waitForTimeout` calls across ~100 files in `tests/e2e/`

#### Top 15 Files by Count

| # | File | Count | Primary Pattern |
|---|------|-------|-----------------|
| 1 | `map-search-results.anon.spec.ts` | 13 | Debounce + network after map pan |
| 2 | `messaging/messaging-resilience.spec.ts` | 12 | 3s error handling waits |
| 3 | `search-map-list-sync.anon.spec.ts` | 8 | Animation + state sync |
| 4 | `helpers/stability-helpers.ts` | 8 | Generic utility waits |
| 5 | `search-filters/filter-gender-language.anon.spec.ts` | 8 | Input settling |
| 6 | `mobile/mobile-bookings.spec.ts` | 8 | Interaction waits |
| 7 | `listing-edit/listing-edit.spec.ts` | 8 | Input settling |
| 8 | `journeys/a11y-audit.anon.spec.ts` | 8 | Mixed patterns |
| 9 | `journeys/listing-carousel.spec.ts` | 8 | Carousel animation |
| 10 | `search-filters/filter-date.anon.spec.ts` | 7 | Filter interaction |
| 11 | `journeys/22-messaging-conversations.spec.ts` | 7 | Message polling |
| 12 | `a11y/dark-mode-a11y.auth.spec.ts` | 6 | Theme transition |
| 13 | `search-filters/filter-category-bar.anon.spec.ts` | 6 | Filter updates |
| 14 | `terminal3-filters-nav.spec.ts` | 6 | Navigation waits |
| 15 | `map-pan-zoom.spec.ts` | 6 | Map interaction |

### Category Breakdown by Timeout Value

| Category | Count | % | Verdict |
|----------|-------|---|---------|
| **0-100ms** (50ms, 80ms, 100ms) | ~22 | 6% | KEEP — likely Radix/component state settling; add comments |
| **100-500ms** (200ms, 250ms, 300ms, 500ms) | ~147 | 41% | **REPLACE** — input settling, animation waits |
| **500-1000ms** (600ms, 800ms, 1000ms) | ~56 | 16% | **REPLACE** — debounce + network waits |
| **1000ms+** (1500ms, 2000ms, 3000ms, 5000ms) | ~111 | 31% | **MUST REPLACE** — biggest perf/flake drain |
| **Variables** (timeouts.animation, DEBOUNCE_MS) | ~24 | 7% | **MIXED** — animation ones deletable (fixture disables CSS animations) |

### Category Breakdown by Purpose

| Purpose | Est. Count | Replacement API | Priority |
|---------|-----------|-----------------|----------|
| **Animation waits** (timeouts.animation, 500ms after show/hide) | ~35 | DELETE entirely — fixture disables CSS animations | P0 |
| **Debounce + network** (MAP_SEARCH_DEBOUNCE_MS + margin) | ~25 | `page.waitForResponse(pattern)` or `page.waitForFunction(urlChanged)` | P1 |
| **Error handling** (3000ms blind wait for error UI) | ~53 | `page.waitForResponse()` then `expect(toast).toBeVisible()` | P1 |
| **Input settling** (200-500ms after fill/clear) | ~40 | `expect(input).toHaveValue()` or remove (Playwright auto-waits) | P2 |
| **DOM element appearance** (generic 1-2s waits) | ~80 | `expect(locator).toBeVisible()` or `locator.waitFor()` | P2 |
| **State transition** (polling for count changes) | ~30 | `expect.poll(() => locator.count())` | P2 |
| **Map interaction** (pan/zoom settle) | ~15 | `page.waitForFunction(() => !map.isMoving())` | P2 |
| **Navigation** (page load) | ~10 | `page.waitForLoadState('domcontentloaded')` | P3 |
| **Component state** (0-100ms Radix settling) | ~22 | KEEP with comment documenting intent | P3 |

### Existing Good Patterns (Use as Reference)

The codebase already has excellent condition-based wait helpers in:

1. **`tests/e2e/helpers/test-utils.ts`** — `waitForMapReady()` uses `page.waitForFunction()` to poll `map.loaded() && !map.isMoving()`
2. **`tests/e2e/helpers/sync-helpers.ts`** — `pollForMarkers()` uses `expect.poll()` for marker count assertions
3. **`tests/e2e/helpers/test-utils.ts`** — `waitForDebounceAndResponse()` combines debounce + `page.waitForResponse()`
4. **`tests/e2e/helpers/stability-helpers.ts`** — Has some good patterns but also 8 `waitForTimeout` calls to fix

### Replacement Pattern Catalog

#### Pattern A: Animation Wait → DELETE
```typescript
// BEFORE (35+ occurrences)
await page.waitForTimeout(timeouts.animation); // 500ms
await page.waitForTimeout(500); // "wait for animation"

// AFTER — The test fixture already injects CSS:
//   animation-duration: 0s !important; transition-duration: 0s !important;
// So animation waits are always 0ms. Just delete them.
await expect(element).toBeVisible(); // auto-retries, no timing needed
```

#### Pattern B: Debounce + Network → waitForResponse
```typescript
// BEFORE (map-search-results.anon.spec.ts:403)
await simulateMapPan(page, 150, 75);
await page.waitForTimeout(MAP_SEARCH_DEBOUNCE_MS + 500);

// AFTER
await simulateMapPan(page, 150, 75);
await page.waitForResponse(
  resp => resp.url().includes('/api/search') && resp.status() === 200,
  { timeout: 15_000 }
);
```

#### Pattern C: Error Handling → waitForResponse + assertion
```typescript
// BEFORE (messaging-resilience.spec.ts:159)
await sendMessage(page, testMsg);
await page.waitForTimeout(3000);
const errorToast = await toast.isVisible().catch(() => false);

// AFTER
const responsePromise = page.waitForResponse(
  r => r.url().includes('/messages') && r.request().method() === 'POST'
);
await sendMessage(page, testMsg);
const response = await responsePromise;
if (!response.ok()) {
  await expect(page.locator('[data-testid="toast"]')).toBeVisible({ timeout: 5000 });
}
```

#### Pattern D: Input Settling → assertion-based
```typescript
// BEFORE (filter-price.anon.spec.ts:44)
await input.click();
await page.waitForTimeout(300);
await input.clear();

// AFTER
await input.click();
await input.fill(''); // Playwright auto-waits for actionability
await expect(input).toHaveValue('');
```

#### Pattern E: DOM Element Polling → expect.poll()
```typescript
// BEFORE
await page.waitForTimeout(2000);
const markerCount = await markers.count();
expect(markerCount).toBeGreaterThan(0);

// AFTER
await expect.poll(
  () => page.locator('.maplibregl-marker:visible').count(),
  { timeout: 10_000, message: 'Expected at least 1 map marker' }
).toBeGreaterThan(0);
```

#### Pattern F: Map State → waitForFunction
```typescript
// BEFORE (map-pan-zoom.spec.ts)
await simulateMapPan(page, 200, 100);
await page.waitForTimeout(1000);

// AFTER
await simulateMapPan(page, 200, 100);
await page.waitForFunction(
  () => {
    const map = (window as any).__e2eMapRef;
    return map && map.loaded() && !map.isMoving() && !map.isZooming();
  },
  { timeout: 15_000 }
);
```

### Phased Implementation Plan

#### Phase 1: Quick Wins (Est. 2-3 hours)
**Target**: Remove ~35 animation waits + document ~22 acceptable short waits
**Files**: All files using `timeouts.animation` or 500ms "animation" waits
**Risk**: LOW — animations are already 0ms via fixture
**Verification**: Run `pnpm test:e2e` on modified specs; expect identical pass rates

Action items:
- [ ] Delete all `await page.waitForTimeout(timeouts.animation)` calls (~17 occurrences)
- [ ] Delete all `await page.waitForTimeout(500)` where context is "animation" (~18 occurrences)
- [ ] Add `// Intentional: Radix component state settling buffer` to all 0-100ms waits
- [ ] Run affected specs, verify pass rate unchanged

#### Phase 2: High Priority — Top 5 Files (Est. 6-8 hours)
**Target**: Convert ~53 calls in the 5 worst files
**Files**:
1. `map-search-results.anon.spec.ts` (13) — Pattern B (debounce+network) + Pattern F (map state)
2. `messaging/messaging-resilience.spec.ts` (12) — Pattern C (error handling)
3. `search-map-list-sync.anon.spec.ts` (8) — Patterns A+B+E
4. `helpers/stability-helpers.ts` (8) — Create proper utility wrappers
5. `search-filters/filter-gender-language.anon.spec.ts` (8) — Pattern D (input settling)
**Risk**: MEDIUM — these are complex specs; each conversion needs individual verification
**Verification**: Run each spec 3x to check for flake introduction

Action items:
- [ ] Convert `map-search-results.anon.spec.ts`: replace 13 timeouts with waitForResponse/waitForFunction
- [ ] Convert `messaging-resilience.spec.ts`: replace 12 error-wait patterns with waitForResponse
- [ ] Convert `search-map-list-sync.anon.spec.ts`: delete animation waits, add assertion-based waits
- [ ] Refactor `stability-helpers.ts`: replace 8 generic waits with condition-based helpers
- [ ] Convert `filter-gender-language.anon.spec.ts`: replace input settling with assertion waits
- [ ] Run each file 3x locally to verify no flake introduction

#### Phase 3: Systematic — Next 20 Files (Est. 10-12 hours)
**Target**: Convert ~120 calls across files with 4-8 occurrences each
**Files**: All files in the 6-20 range of the count table
**Risk**: MEDIUM — bulk changes; use per-file verification
**Verification**: Run full `pnpm test:e2e` after each batch of 5 files

Action items:
- [ ] Batch 1 (5 files): listing-edit, mobile-bookings, a11y-audit, listing-carousel, filter-date
- [ ] Batch 2 (5 files): messaging-conversations, dark-mode-a11y, filter-category-bar, terminal3-filters, map-pan-zoom
- [ ] Batch 3 (5 files): notifications, search-loading-states, mobile-ux, map-interactions, mobile-bottom-sheet
- [ ] Batch 4 (5 files): journeys/discovery-search, search-pagination-journey, booking-lifecycle, filter-recommended, filter-count-preview
- [ ] Full CI run after all batches

#### Phase 4: Long Tail — Remaining Files (Est. 8-10 hours)
**Target**: Convert remaining ~150 calls across 80+ files (1-3 per file)
**Files**: All remaining spec files with 1-3 waitForTimeout calls
**Risk**: LOW per file but HIGH cumulative (many small changes)
**Verification**: Full CI run; compare flake rate before/after

Action items:
- [ ] Process files alphabetically in groups of 10
- [ ] Create shared helpers for repeated patterns (e.g., `waitForFilterUpdate()`, `waitForMapSettle()`)
- [ ] Add ESLint rule `no-restricted-properties` to flag new waitForTimeout usage
- [ ] Final CI run with 3 retries to measure flake rate delta

### Test Strategy

1. **Per-file verification**: After modifying each spec, run it 3x locally to detect flake introduction
2. **Batch verification**: After each batch of 5 files, run the full E2E suite once
3. **Phase gate**: After Phase 2, compare CI flake rate over 5 runs vs baseline
4. **Regression signal**: If flake rate increases >5% over baseline, stop and investigate
5. **CI metric**: Track total E2E wall-clock time; expect 2-3 min improvement after Phase 4

### Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Replacing timeout introduces new flake | HIGH | Run each converted spec 3x locally; revert if flake detected |
| Some timeouts guard real async behavior not visible via API/DOM | MEDIUM | Read surrounding code to understand purpose before replacing; keep 0-100ms buffers |
| Bulk changes make bisecting regressions hard | MEDIUM | Commit per-file or per-batch; never commit all at once |
| waitForResponse pattern misses response (wrong URL pattern) | LOW | Use broad URL patterns initially; tighten after verification |
| Map interaction waits depend on real rendering time | LOW | Use `waitForFunction` with map ref; increase timeout to 15s |

### Acceptance Criteria

- [ ] Total `waitForTimeout` calls reduced from ~360 to <50
- [ ] Remaining calls are all <100ms with documenting comments
- [ ] No increase in E2E flake rate (measured over 5 CI runs)
- [ ] E2E total wall-clock time reduced by ≥90 seconds
- [ ] ESLint rule prevents new `waitForTimeout` introductions
- [ ] New shared helpers documented in `tests/e2e/helpers/README.md` (if one exists) or inline comments

---

## QUAL-H2: Reduce `as any` Casts in Production Code

### Verified Inventory

**Actual production code `as any` casts**: 10 instances across 8 files (excluding tests, scripts, and comment-only matches)

| # | File | Line | Cast | Pattern |
|---|------|------|------|---------|
| 1 | `src/auth.ts` | 27 | `PrismaAdapter(prisma) as any` | Third-party lib incompatibility |
| 2 | `src/app/admin/audit/page.tsx` | 64 | `actionFilter as any` | Prisma enum narrowing |
| 3 | `src/app/notifications/page.tsx` | 20 | `notifications as any` | API response → component props |
| 4 | `src/app/messages/[id]/ChatWindow.tsx` | 337 | `payload.new as any` | Supabase realtime payload |
| 5 | `src/app/api/listings/route.ts` | 156 | `user as any` | Prisma select narrowing |
| 6 | `src/lib/audit.ts` | 51 | `(params.details \|\| {}) as any` | Prisma JSON field |
| 7 | `src/scripts/simulate-user-flow.ts` | 80 | `(l as any).amenities` | Untyped API response |
| 8 | `src/scripts/simulate-user-flow.ts` | 187 | `(l as any).houseRules` | Untyped API response |
| 9 | `src/scripts/simulate-user-flow.ts` | 207 | `(l as any).houseRules` | Untyped API response |
| 10 | `src/app/actions/settings.ts` | 75 | (COMMENT ONLY — already fixed) | N/A |

**Actual production code `: any` annotations**: 17 instances across 14 files

| # | File | Line | Annotation | Pattern |
|---|------|------|------------|---------|
| 1 | `src/app/profile/ProfileClient.tsx` | 55 | `}: any` (Badge props) | Untyped component props |
| 2 | `src/app/users/[id]/UserProfileClient.tsx` | 65 | `icon?: any` (Badge) | Untyped component props |
| 3 | `src/app/messages/[id]/ChatWindow.tsx` | 377 | `(p: any)` filter | Supabase presence type |
| 4 | `src/app/messages/[id]/ChatWindow.tsx` | 381 | `(p: any)` some | Supabase presence type |
| 5 | `src/app/messages/[id]/ChatWindow.tsx` | 385 | `(p: any)` some | Supabase presence type |
| 6 | `src/app/messages/[id]/ChatWindow.tsx` | 391 | `(p: any)` filter | Supabase presence type |
| 7 | `src/components/NavbarClient.tsx` | 127 | `user: any` | Session user prop |
| 8 | `src/components/ContactHostButton.tsx` | 30 | `error: any` | Catch clause |
| 9 | `src/components/ReviewForm.tsx` | 180 | `err: any` | Catch clause |
| 10 | `src/components/ImageGallery.tsx` | 31 | `[key: string]: any` | Index signature |
| 11 | `src/app/listings/[id]/edit/EditListingForm.tsx` | 416 | `err: any` | Catch clause |
| 12 | `src/components/MessagesPageClient.tsx` | 72 | `any[]` | Conversation type |
| 13 | `src/components/neighborhood/NeighborhoodMap.tsx` | 257 | `event: any` | Map click event |
| 14 | `src/app/bookings/page.tsx` | 31 | `b: any` | Booking converter |
| 15 | `src/app/api/search/facets/route.ts` | 86 | `...values: any[]` | Prisma raw query |
| 16 | `src/app/api/search/facets/route.ts` | 88 | `...values: any[]` | Prisma raw query |
| 17 | `src/scripts/simulate-user-flow.ts` | 335 | `(r: any)` | Untyped callback |

**Grand total production `any` usage**: 27 instances (10 `as any` + 17 `: any`)
**Test-only `any` usage**: ~54 instances (SKIP — acceptable in tests)

### Pattern Categorization with Typed Replacements

#### Pattern 1: Catch Clause `error: any` → `error: unknown` (3 instances, LOW risk)

**Files**: ContactHostButton.tsx:30, ReviewForm.tsx:180, EditListingForm.tsx:416

```typescript
// BEFORE
} catch (err: any) {
  setError(err.message);
}

// AFTER
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'An unexpected error occurred';
  setError(message);
}
```

**Risk**: None. This is a TypeScript best practice. `unknown` is the correct type for catch clauses.

#### Pattern 2: Untyped Component Props (3 instances, LOW risk)

**Files**: ProfileClient.tsx:55, UserProfileClient.tsx:65, NavbarClient.tsx:127

```typescript
// BEFORE (ProfileClient.tsx:55)
const Badge = ({ icon: Icon, text, variant = "default" }: any) => { ... }

// AFTER
interface BadgeProps {
  icon?: React.ComponentType<{ className?: string }>;
  text: string;
  variant?: 'default' | 'verified';
}
const Badge = ({ icon: Icon, text, variant = "default" }: BadgeProps) => { ... }

// BEFORE (NavbarClient.tsx:127)
user: any;

// AFTER — use the project's existing Session type
import { Session } from 'next-auth';
user: Session['user'];
```

**Risk**: Low. Props are used locally within the same file.

#### Pattern 3: Supabase Realtime Presence Types (5 instances, MEDIUM risk)

**Files**: ChatWindow.tsx:337,377,381,385,391

```typescript
// BEFORE
const newMessage = payload.new as any;
.filter((p: any) => p.user_id !== currentUserId);

// AFTER — define the realtime payload types
interface SupabasePresence {
  user_id: string;
  email?: string;
  lastSeen?: string;
}

interface RealtimeMessagePayload {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

const newMessage = payload.new as RealtimeMessagePayload;
.filter((p: SupabasePresence) => p.user_id !== currentUserId);
```

**Risk**: Medium. Must verify Supabase realtime payload shape matches. Check Supabase docs or test with console.log.

#### Pattern 4: Prisma Type Narrowing (3 instances, LOW risk)

**Files**: api/listings/route.ts:156, admin/audit/page.tsx:64, lib/audit.ts:51

```typescript
// BEFORE (api/listings/route.ts:156)
const completion = calculateProfileCompletion(user as any);

// AFTER — update calculateProfileCompletion to accept Prisma select result
// Option A: Widen the function parameter type
type ProfileCompletionInput = Pick<User, 'name' | 'email' | 'bio' | 'image' | 'languages' | 'isVerified'>;
function calculateProfileCompletion(user: ProfileCompletionInput) { ... }

// Option B: Use Prisma's generated types
import { Prisma } from '@prisma/client';
type UserWithProfile = Prisma.UserGetPayload<{ select: { name: true; email: true; ... } }>;

// BEFORE (admin/audit/page.tsx:64)
action: actionFilter as any

// AFTER — use Prisma's AuditAction enum
import { AuditAction } from '@prisma/client';
action: actionFilter as AuditAction  // or validate with zod

// BEFORE (lib/audit.ts:51)
details: (params.details || {}) as any

// AFTER — Prisma's JSON type accepts Prisma.JsonValue
import { Prisma } from '@prisma/client';
details: (params.details || {}) as Prisma.JsonValue
```

**Risk**: Low. Prisma generated types are reliable.

#### Pattern 5: Third-Party Library Incompatibility (1 instance, KEEP)

**File**: auth.ts:27

```typescript
// CURRENT
adapter: PrismaAdapter(prisma) as any,

// RECOMMENDED — use @ts-expect-error for documentation
// @ts-expect-error PrismaAdapter type doesn't match NextAuth AdapterConfig (known issue)
adapter: PrismaAdapter(prisma),
```

**Risk**: N/A — this is a known NextAuth/Prisma adapter limitation. Keep the cast but improve documentation.

#### Pattern 6: Untyped API/Data Responses (5 instances, LOW risk)

**Files**: notifications/page.tsx:20, MessagesPageClient.tsx:72, bookings/page.tsx:31, ImageGallery.tsx:31

```typescript
// BEFORE (notifications/page.tsx:20)
return <NotificationsClient initialNotifications={notifications as any} ... />;

// AFTER — type the getNotifications return and the component prop
interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
}
// Ensure getNotifications returns NotificationItem[] and NotificationsClient accepts it

// BEFORE (bookings/page.tsx:31)
const convertBooking = (b: any) => ({ ... });

// AFTER
import { Prisma } from '@prisma/client';
type BookingWithListing = Prisma.BookingGetPayload<{
  include: { listing: { select: { title: true; images: true } } }
}>;
const convertBooking = (b: BookingWithListing) => ({ ... });

// BEFORE (MessagesPageClient.tsx:72)
initialConversations: any[];

// AFTER
import { Prisma } from '@prisma/client';
type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: { participants: true; messages: { take: 1; orderBy: { createdAt: 'desc' } } }
}>;
initialConversations: ConversationWithDetails[];
```

**Risk**: Low-Medium. Need to verify Prisma include shapes match actual queries.

#### Pattern 7: Map/External Event Types (1 instance, LOW risk)

**File**: NeighborhoodMap.tsx:257

```typescript
// BEFORE
const onClusterClick = useCallback(async (event: any) => { ... }, []);

// AFTER — import the correct map event type
import { MapMouseEvent } from 'maplibre-gl';
const onClusterClick = useCallback(async (event: MapMouseEvent) => { ... }, []);
```

**Risk**: Low. MapLibre GL JS has good type definitions.

#### Pattern 8: Raw SQL Query Parameters (2 instances, KEEP or LOW-effort fix)

**File**: api/search/facets/route.ts:86,88

```typescript
// CURRENT — this is a Prisma type extension interface
$queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Promise<T>;

// RECOMMENDED — use Prisma's built-in types
import { Prisma } from '@prisma/client';
$queryRawUnsafe<T = unknown>(query: string, ...values: Prisma.Sql[]): Promise<T>;
// OR keep as-is since this is mirroring Prisma's own type signature
```

**Risk**: Low. This is a type declaration, not runtime code. Prisma's own types use `any[]` here.

#### Pattern 9: Script Files (4 instances, LOW priority)

**File**: simulate-user-flow.ts:80,187,207,335 + verify_listing.ts:25

These are dev/CI scripts, not production code. Low priority.

```typescript
// Define a ListingSearchResult interface at the top of the script
interface ListingSearchResult {
  id: string;
  title: string;
  price: number;
  amenities?: string[];
  houseRules?: string[];
}
```

### Phased Implementation Plan

#### Phase 1: Quick Wins — Zero Risk (Est. 1-2 hours)
**Target**: 6 instances eliminated

| # | File | Line | Change | Risk |
|---|------|------|--------|------|
| 1 | ContactHostButton.tsx | 30 | `error: any` → `error: unknown` + instanceof guard | None |
| 2 | ReviewForm.tsx | 180 | `err: any` → `err: unknown` + instanceof guard | None |
| 3 | EditListingForm.tsx | 416 | `err: any` → `err: unknown` + instanceof guard | None |
| 4 | ProfileClient.tsx | 55 | Define `BadgeProps` interface | None |
| 5 | UserProfileClient.tsx | 65 | Define `BadgeProps` interface | None |
| 6 | NavbarClient.tsx | 127 | `user: any` → `user: Session['user']` | None |

**Verification**: `pnpm typecheck && pnpm test:components`

#### Phase 2: Prisma Type Fixes (Est. 2-3 hours)
**Target**: 6 instances eliminated

| # | File | Line | Change | Risk |
|---|------|------|--------|------|
| 1 | api/listings/route.ts | 156 | Type `calculateProfileCompletion` param | Low |
| 2 | admin/audit/page.tsx | 64 | Use `AuditAction` enum | Low |
| 3 | lib/audit.ts | 51 | Use `Prisma.JsonValue` | Low |
| 4 | notifications/page.tsx | 20 | Type notification response | Low |
| 5 | bookings/page.tsx | 31 | Use Prisma `GetPayload` type | Low |
| 6 | MessagesPageClient.tsx | 72 | Use Prisma `GetPayload` type | Low-Med |

**Verification**: `pnpm typecheck && pnpm test:api && pnpm test:components`

#### Phase 3: Supabase + External Types (Est. 3-4 hours)
**Target**: 7 instances eliminated

| # | File | Line | Change | Risk |
|---|------|------|--------|------|
| 1-5 | ChatWindow.tsx | 337,377,381,385,391 | Define Supabase payload types | Medium |
| 6 | NeighborhoodMap.tsx | 257 | Use `MapMouseEvent` | Low |
| 7 | ImageGallery.tsx | 31 | Replace index signature | Low |

**Verification**: `pnpm typecheck && pnpm test:components` + manual test of messaging

#### Phase 4: Cleanup + Documentation (Est. 1 hour)
**Target**: Remaining items

| # | File | Line | Change | Risk |
|---|------|------|--------|------|
| 1 | auth.ts | 27 | Replace `as any` with `@ts-expect-error` comment | None |
| 2 | facets/route.ts | 86,88 | Keep or use `Prisma.Sql[]` | Low |
| 3-6 | simulate-user-flow.ts | 80,187,207,335 | Add `ListingSearchResult` interface | None |

**Verification**: `pnpm typecheck`

### Test Strategy

1. **After each phase**: Run `pnpm typecheck` (must pass with 0 errors)
2. **After Phase 1**: Run `pnpm test:components` (Badge, Navbar, form components)
3. **After Phase 2**: Run `pnpm test:api` (listings route, audit, bookings)
4. **After Phase 3**: Run `pnpm test:components` + manual smoke test of messaging page
5. **Final**: Full `pnpm test` to verify no regressions

### Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Prisma `GetPayload` type doesn't match actual query shape | MEDIUM | Verify by reading the actual Prisma query and its `include`/`select` |
| Supabase realtime payload shape varies by table config | MEDIUM | Log actual payload in dev; verify fields exist |
| Changing catch clause type breaks error handling | LOW | `instanceof Error` guard is the standard pattern; always provide fallback message |
| Badge props interface too narrow | LOW | Start with broad types; narrow later if needed |
| NextAuth adapter type cast removal causes build error | LOW | Use `@ts-expect-error` — documented as known issue |

### Acceptance Criteria

- [ ] Production `any` count reduced from 27 to ≤8 (auth.ts adapter + facets raw SQL + scripts)
- [ ] `pnpm typecheck` passes with 0 errors
- [ ] All existing tests pass (`pnpm test`)
- [ ] No new type definitions use `any` (grep verification)
- [ ] Each removed `any` replaced with specific type, not `unknown` (except catch clauses)

---

## Dependency Graph

```
QUAL-H1 and QUAL-H2 are independent — can be executed in parallel.

QUAL-H1 phases are sequential:
  Phase 1 (animation deletes) → Phase 2 (top 5 files) → Phase 3 (next 20) → Phase 4 (long tail)

QUAL-H2 phases are sequential:
  Phase 1 (catch + props) → Phase 2 (Prisma types) → Phase 3 (Supabase) → Phase 4 (cleanup)

No cross-dependencies between H1 and H2.
```

## Rollback Plan

**QUAL-H1**: Each phase committed separately. If flake rate increases, `git revert` the phase commit. Individual file changes can be reverted independently.

**QUAL-H2**: Each phase committed separately. If typecheck fails after a phase, revert that phase's commit. Type changes are purely compile-time — no runtime risk.

## Open Questions

1. **QUAL-H1**: Should we create a shared `waitForFilterUpdate()` helper that combines debounce + waitForResponse, or inline the pattern in each test? (Recommend: shared helper)
2. **QUAL-H1**: What's the acceptable final count of `waitForTimeout` calls? (Recommend: <50, all <100ms with comments)
3. **QUAL-H2**: Should we add `"noImplicitAny": true` to tsconfig if not already enabled? (Note: `strict: true` is already on, which includes `noImplicitAny`)
4. **QUAL-H2**: Should we add an ESLint rule to flag new `as any` introductions? (Recommend: `@typescript-eslint/no-explicit-any` with severity `warn`)

## Total Effort Estimate

| Item | Effort | Risk |
|------|--------|------|
| QUAL-H1 Phase 1 | 2-3 hours | LOW |
| QUAL-H1 Phase 2 | 6-8 hours | MEDIUM |
| QUAL-H1 Phase 3 | 10-12 hours | MEDIUM |
| QUAL-H1 Phase 4 | 8-10 hours | LOW-MEDIUM |
| QUAL-H2 Phase 1 | 1-2 hours | LOW |
| QUAL-H2 Phase 2 | 2-3 hours | LOW |
| QUAL-H2 Phase 3 | 3-4 hours | MEDIUM |
| QUAL-H2 Phase 4 | 1 hour | LOW |
| **Total** | **33-43 hours** | — |
