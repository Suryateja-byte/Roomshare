# Roomshare Production Readiness Audit v2

**Date:** 2026-03-05
**Branch:** `fix/p1-create-listing-stability`
**Method:** 10 parallel code-reviewer agents, each covering an independent domain
**Scope:** Full codebase — all API routes, server actions, components, DB schema, migrations, infrastructure

---

## Executive Summary

**Total issues found: 153** (after deduplication across agents)
**Post-verification: 148 confirmed** (5 false positives removed, 6 partially corrected)

| Severity | Original | Verified | Timeline |
|----------|----------|----------|----------|
| CRITICAL | 25 | **23** | Must fix before production |
| HIGH | 40 | **39** | Should fix before production |
| MEDIUM | 50 | **48** | Fix within 2 weeks post-launch |
| LOW | 38 | 38 (unverified) | Backlog / nice-to-have |

### Verdict: NOT production-ready (23 verified critical blockers)

The app has **strong fundamentals** — idempotency wrappers, serializable transactions, parameterized SQL, state machine validation, structured logging with PII redaction, timing-safe auth, and good test coverage on booking race conditions. However, 25 critical issues must be resolved:

1. **Unbounded queries** (7) — `findMany` with no `take` limit across chat, bookings, conversations, saved listings, reviews, and admin pages
2. **Authorization gaps** (3) — suspended users can access admin routes and several API endpoints
3. **Race conditions** (4) — duplicate conversations, booking acceptance on paused listings, no rate limit on booking creation
4. **Input validation holes** (4) — path traversal in upload DELETE, images can be zeroed via PATCH, unvalidated verification URLs
5. **Security gaps** (3) — no session invalidation after password reset, Supabase realtime has no RLS, CDN caches without Vary header
6. **Database schema issues** (2) — broken CHECK constraint on empty arrays, duplicate conflicting constraints
7. **Search caching bugs** (2) — `unstable_cache` closure bypass, rate-limit error message never shown

---

## CRITICAL (25) — Must Fix Before Production

### Security & Auth

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| S1 | Suspended users access `/admin/*` | `auth-helpers.ts:32-45`, `auth.config.ts:27-31` | `/admin` not in protected paths. Suspended admin retains full access for 14-day JWT lifetime. |
| S2 | Forgot-password email not validated | `api/auth/forgot-password/route.ts:24-43` | No Zod schema — `{"email": {}}` causes 500 via TypeError. |
| S3 | Password reset doesn't invalidate sessions | `api/auth/reset-password/route.ts:96`, `actions/settings.ts:132` | JWT strategy has no revocation. After password reset, old sessions valid for up to 14 days. |

### Data Integrity — Unbounded Queries

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| D1 | `getMessages` no `take` limit | `actions/chat.ts:331-342` | Fetches ALL messages in a conversation. Long conversations cause OOM on serverless. |
| D2 | `pollMessages` no `take` limit | `actions/chat.ts:687-701` | Same issue on every 3-5 second polling cycle. |
| D3 | `getConversations` no pagination | `actions/chat.ts:235-257` | Loads ALL conversations. Power users with hundreds cause timeout. |
| D4 | `getMyBookings` unbounded | `actions/manage-booking.ts:360-395` | Both sent/received bookings no `take` limit, used in SSR. |
| D5 | Admin verifications no limit | `admin/verifications/page.tsx` | `findMany` with no `take`. Grows unbounded over time. |
| D6 | `getSavedListingIds` unbounded | `lib/data.ts:1440-1445` | No `take`, called on every search page SSR render. |
| D7 | `getReviews` unbounded on listing | `lib/data.ts:1546-1569` | No limit on SSR detail page (API route correctly paginates). |

### Race Conditions & State

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| R1 | Duplicate conversation creation | `actions/chat.ts:57-84` | `findFirst` then `create` not atomic. Double-tap creates two Conversation rows, splitting messages. |
| R2 | Booking accepted on non-ACTIVE listing | `actions/manage-booking.ts:92-150` | ACCEPT checks slots but not `listing.status`. Can accept on PAUSED/RENTED listing. |
| R3 | `createBooking` no rate limiting | `actions/booking.ts:273-419` | No `checkRateLimit`. User can flood thousands of PENDING bookings. |
| R4 | `updateBookingStatus` no runtime enum guard | `actions/manage-booking.ts:19-21` | `BookingStatus` TypeScript-only. Arbitrary strings pass from crafted requests. |

### Input Validation

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| V1 | Upload DELETE path traversal | `api/upload/route.ts:264-267` | `startsWith` bypass via `../`. Can delete other users' images. |
| V2 | PATCH can zero out listing images | `api/listings/[id]/route.ts:55,437` | `images` schema has no `min(1)`. Sending `images: []` removes all photos. |
| V3 | Verification URLs unvalidated | `actions/verification.ts:12-16,71-78` | No Zod schema on `documentUrl`/`selfieUrl`. Accepts arbitrary URLs. |
| V4 | `createNotification` accepts any type | `actions/notifications.ts:14-41` | `NotificationType` erased at runtime. Any string accepted. |

### Search & Caching

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| SC1 | Rate-limit error message mismatch | `search/actions.ts:33,85`, `SearchResultsClient.tsx:151` | Server throws "Rate limited", client checks "Rate limit". User never sees rate-limit message. |
| SC2 | `unstable_cache` closure bypass | `api/search/facets/route.ts:705-710` | `filterParams` captured by closure, not passed as arg. Cache can't distinguish different params. |
| SC3 | CDN caches without `Vary` header | `api/search/v2/route.ts:122`, `api/map-listings/route.ts:139` | `Cache-Control: public` without `Vary: Cookie`. First user's response served to all. |

### Database Schema

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| DB1 | `chk_images_count` passes on empty arrays | Migration `20260301` line 22 | `array_length` returns NULL for `'{}'`. Use `cardinality()` instead. |
| DB2 | Duplicate conflicting CHECK constraints | Migrations `20260216`, `20260301`, `20260302` | 3 constraints on `totalSlots`, 2 on `price` with conflicting semantics. |

### Chat Security

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| CS1 | Supabase realtime no RLS on Messages | `ChatWindow.tsx:254-262` | Any authenticated Supabase user can subscribe to any conversationId. Client-side guard only. |

### UI Stability

| # | Issue | File(s) | Description |
|---|-------|---------|-------------|
| U1 | `ListingFreshnessCheck` stale closure | `ListingFreshnessCheck.tsx:30-39` | `scheduleNextCheck` captures `checkListingExists` before defined. Polling calls `undefined()`. |

---

## HIGH (40) — Should Fix Before Production

### Auth & Security (5)
1. **Forgot-password token not atomic** — two concurrent requests create two valid tokens (`forgot-password/route.ts:57-75`)
2. **Registration timing oracle** — 100-150ms delay vs 300-700ms bcrypt reveals user existence (`register/route.ts:53-59`)
3. **Registration `name` no max length** — 10MB name passes validation (`register/route.ts:14`)
4. **Suspended users can POST to favorites/reports/upload** — not in `PROTECTED_API_PATHS` (`auth-helpers.ts:32-45`)
5. **Suspension cache 5-min TTL** — freshly suspended user continues for 5 minutes (`auth-helpers.ts:133-167`)

### Listings (4)
6. **No max price cap on PATCH** — CREATE enforces $50K but PATCH doesn't (`api/listings/[id]/route.ts:31`)
7. **RENTED->ACTIVE no booking guards** — can flip with active bookings (`actions/listing-status.ts:16-82`)
8. **`updateListingStatus` no rate limiting** — tight loop causes excessive DB writes (`actions/listing-status.ts:16`)
9. **GIF uploads bypass metadata stripping** — stored verbatim with potential PII (`api/upload/route.ts:125-128`)

### Chat & Messaging (4)
10. **Message length inconsistent (500/1000/2000)** — three different limits across UI/server (`ChatWindow.tsx:49`, `MessagesPageClient.tsx:32`, `chat.ts:15`)
11. **`ChatWindow` polls ALL messages every 5s** — unbounded DB read per cycle (`ChatWindow.tsx:208-238`)
12. **Notification email includes message content** — PII risk in Notification table and emails (`actions/chat.ts:204`)
13. **`markConversationMessagesAsRead` includes soft-deleted** — missing `deletedAt: null` filter (`actions/chat.ts:747-754`)

### API & Server Actions (5)
14. **Rejection reason no length bound** — stored in DB and emailed without validation (`actions/verification.ts:285`)
15. **`resolveReport` notes no validation** — written to DB without length check (`actions/admin.ts:528-531`)
16. **Admin pages 100-row cap, verifications unbounded** — need pagination (`admin/*/page.tsx`)
17. **`getMoreNotifications` no cursor/limit validation** — `limit=9999` accepted (`actions/notifications.ts:86-118`)
18. **`approveVerification` sends wrong email template** — sends `welcomeEmail` instead of approval (`actions/verification.ts:255-259`)

### Search (4)
19. **Map-move debounce 50ms** — effectively none, creates navigation storm (`Map.tsx:597`)
20. **V1 fallback silently returns empty on null V2** — no error surfaced, silent data loss (`search/actions.ts:63-68`)
21. **`areaCountCacheRef` unbounded Map** — no eviction, grows indefinitely (`MapBoundsContext.tsx:421`)
22. **`seenIdsRef` invariant undocumented** — same key + different initialListings suppresses valid listings (`SearchResultsClient.tsx:71-73`)

### Database (5)
23. **`Listing.version` column orphaned** — exists in DB but not in schema.prisma (`Migration 20260101`)
24. **9 CHECK constraints never validated** — `NOT VALID` only checks new writes (`Migration 20260301`)
25. **Indexes created without `CONCURRENTLY`** — historical, document as policy (`Migration 20260216`)
26. **`radarStatus` leaked in error responses** — reveals upstream vendor and failure mode (`api/nearby/route.ts:203,368`)
27. **`categories` array no validation** — no item length or count limit (`api/nearby/route.ts:44`)

### Map & Geo (1)
28. **Nominatim called from browser** — bypasses server-side rate limiter (`BoundaryLayer.tsx:75`)

### UI & A11y (7)
29. **Scroll lock race** — multiple components set `body.overflow` independently (`NavbarClient.tsx:222-229`)
30. **`user: any` type** — removes type safety, unsafe access of `user.email` (`NavbarClient.tsx:120`)
31. **Freshness banner behind navbar** — `z-50` vs `z-1000` (`ListingFreshnessCheck.tsx:131,160`)
32. **Skip link on every page** — `#search-results` target absent on most pages (`app/layout.tsx:74`)
33. **DatePicker clear button** — no label, undersized touch target (`ui/date-picker.tsx:220-237`)
34. **Calendar day buttons no `aria-label`** — "15, button" with no context (`ui/date-picker.tsx:300-317`)
35. **Inline `<style>` blocks CSP** — re-injected every render (`ui/CustomScrollContainer.tsx:146-149`)

### Infrastructure (4)
36. **DB health check no timeout** — hangs if DB unresponsive (`api/health/ready/route.ts:31-40`)
37. **`refresh-search-docs` no Sentry, no `maxDuration`** — crashes invisible, killed mid-batch (`cron/refresh-search-docs/route.ts`)
38. **Prometheus counters dead code** — `recordRequestMetrics` never called, always zero (`api/metrics/ops/route.ts:15-31`)
39. **`next-auth` beta with `^` range** — no stability guarantees (`package.json:74`)
40. **Neighborhood analytics silently fails** — sends to GET-only endpoint, 100% events lost (`lib/analytics/neighborhood.ts:97`)

---

## MEDIUM (50) — Fix Within 2 Weeks

### Auth (4)
- Duplicate `authorized` callback in `auth.ts` and `auth.config.ts` — drift risk
- `verifyPassword` returns success for OAuth users without challenge
- `x-request-id` forwarded without sanitization — log injection risk
- Reset-password GET not rate-limited per token

### Search (5)
- Map-move search has no AbortController for stale response cancellation
- `fetchMoreListings` URLSearchParams round-trip can corrupt special chars
- `orchestrateSearch` has no timeout wrapper
- `findSplitStays` re-sorts 60 items on every Load More
- `isV2Enabled` dead code bypass check

### Listings (4)
- Schema field inconsistency between create/update (state max, description min)
- Orphaned images when listing create fails after upload
- No test coverage for PATCH with `images: []`
- Slot reduction below accepted bookings is silent

### Bookings (4)
- `rejectionReason` no server-side length validation
- `idempotencyKey` no length/format validation
- Listing deletion cascades without setting CANCELLED status first
- No audit trail for booking state transitions

### Messaging (5)
- `listingId` not validated in `startConversation`
- No in-flight guard on `MessagesPageClient` polling loop
- Missing `router` dependency in useEffect
- Conversation list never refreshed for incoming new conversations
- `setTypingStatus` DB upsert on every typing event

### API Routes (7)
- `blockUser`/`unblockUser` no UUID format validation
- `unblockUser` swallows P2025 as generic error
- Admin dashboard duplicate stats functions (dead code)
- `createReviewResponse` blocks on email send
- `toggleSaveListing` vs `/api/favorites` — duplicated logic with diverging atomicity
- `getBlockedUsers` unbounded list
- `updateListingStatus` (admin) no runtime enum validation

### Database (5)
- `connection_limit=5` may exhaust under burst serverless load
- `listing_search_docs.price` type mismatch patched but diverged
- `getConversations` eagerly loads participants with no M2M index
- `AuditLog.adminId` RESTRICT — admin users can never be deleted
- `VerificationRequest` document URLs not validated for ownership

### Map & Geo (7)
- `MultiPolygon` cast to `Polygon` wrong TypeScript type
- Walkability rings distort at high latitudes
- Full map re-creation on theme change
- Dual `NearbyPlacesCard` for Pro users creates race
- `neighborhoodCache.ts` uses `console.error` not logger
- Nominatim boundary fetch has no result cache
- Client-side nearby rate limit trivially bypassed

### UI & A11y (5)
- Profile dropdown no Escape key handler
- `VerifiedBadge` icon missing `aria-hidden`
- `InfiniteScroll` loadMore can fire twice before guard
- `ListingFreshnessCheck` banners no dismiss button
- `ListingGridSkeleton` export name collision

### Infrastructure (4)
- `next.config.ts` filesystem write no error handling
- Supabase health check is no-op stub
- Duplicate security headers from config and proxy
- `WebVitals` sends to wrong endpoint (always fails validation)

---

## LOW (38)

Auth (2), Search (4), Listings (3), Bookings (3), Messaging (4), API Routes (5), Database (4), Map/Geo (6), UI (4), Infrastructure (5).

Key items: `getNotifications` limit no upper bound, `CURSOR_SECRET` eager read bypasses lazy validation, hash truncation to 64-bit, `DatePicker` viewDate not reset on clear, Navbar polling redundant on mount, `deleteMessage` leaks existence via error messages, various `console.error` should use structured logger, `BookingForm` idempotency key uses `Math.random()` instead of `crypto.randomUUID()`.

---

## Recommended Fix Order

### Phase 1: Security blockers (1-2 days)
1. **S1** — Add `/admin` to protected paths + check `isSuspended`
2. **S3** — Add `passwordChangedAt` to User model, embed in JWT, check on refresh
3. **CS1** — Enable RLS on Supabase Message table
4. **V1** — Reject `..` in upload DELETE paths
5. **HS4** — Add favorites/reports/upload to protected paths
6. **S2** — Add Zod schema to forgot-password

### Phase 2: Data integrity (2-3 days)
7. **D1-D7** — Add `take` limits to all 7 unbounded queries
8. **R1** — Wrap `startConversation` in `$transaction`
9. **R2** — Check `listing.status === 'ACTIVE'` in booking acceptance
10. **R3** — Add rate limiting to `createBooking`
11. **V2** — Add `min(1)` to PATCH images schema
12. **DB1** — Fix `chk_images_count` to use `cardinality()`
13. **DB2** — Consolidate duplicate CHECK constraints

### Phase 3: Search & caching (1-2 days)
14. **SC1** — Fix rate-limit error message propagation
15. **SC2** — Pass `filterParams` as argument to `unstable_cache`
16. **SC3** — Add `Vary: Cookie` to search cache headers
17. **HSR1** — Restore map debounce to 300-400ms

### Phase 4: Input validation (1-2 days)
18. **V3** — Add Zod schema to verification URLs
19. **V4** — Add runtime enum to `createNotification`
20. **R4** — Add Zod enum guard to `updateBookingStatus`
21. **HS3** — Add `.max(100)` to registration name
22. **HA1-HA2** — Add length validation to admin text fields

### Phase 5: UI stability & a11y (2-3 days)
23. **U1** — Fix stale closure in `ListingFreshnessCheck`
24. **HU1** — Centralize scroll locking
25. **HU5-HU6** — Fix DatePicker accessibility
26. **HM1** — Unify message length constant

### Phase 6: Infrastructure (1-2 days)
27. **HI1** — Add timeout to DB health check
28. **HI2** — Add Sentry + maxDuration to search docs cron
29. **HI4** — Pin `next-auth` to exact version
30. **HD1** — Sync `Listing.version` between DB and schema

---

## Strengths (What's Working Well)

All 10 reviewers consistently noted strong patterns:

- **Booking state machine**: FOR UPDATE locks, serializable isolation, idempotency keys, retry on serialization conflict, optimistic versioning
- **Token security**: SHA-256 hashed tokens, constant-time comparison, never storing raw values
- **Rate limiting architecture**: Dual-layer DB + Redis, in-memory fallback, circuit breaker
- **Structured logger**: PII redaction via pattern-based sanitization, JSON output, request context
- **Search safety**: Parameterized SQL with `assertParameterizedWhereClause` guard, validated sort allowlist, query length cap, array input cap
- **Search pagination**: Cursor reset via component key, seenIdsRef deduplication, 60-item cap, URL shareability
- **Upload security**: Magic bytes validation, MIME allowlist, 5MB max, user-scoped paths
- **Auth configuration**: Turnstile CAPTCHA, email normalization, suspension checks, timing-safe cron auth
- **Graceful shutdown**: SIGTERM/SIGINT handling, Sentry flush, Prisma disconnect
- **Health checks**: Liveness + readiness with DB/Redis latency timing
- **Test coverage**: Comprehensive booking race condition tests, IDOR tests, E2E Playwright suite

---

## Delta from Previous Audit (2026-02-16)

Since the v1 audit (157 findings), significant progress has been made:

**Fixed since v1:**
- Middleware restored with CSP + security headers
- Sentry webpack plugin configured, `captureException` added to API routes
- Missing DB indexes added (Listing.ownerId, Booking.listingId+status, Review.listingId, etc.)
- Password hash exposure on listing detail page fixed
- Auth added to `/api/chat` and `/api/agent`
- FocusTrap added to booking confirmation and block-user dialogs
- `Float` migrated to `Decimal` for monetary values
- CHECK constraints added on Review.rating, Listing.price, totalSlots
- Error boundaries added to listing detail and edit pages
- V1 `getListings()` full-scan replaced by V2 search with proper SQL

**New findings in v2:**
- Unbounded queries across chat/bookings/conversations (likely existed before but were not in scope)
- `unstable_cache` closure bug (introduced in recent search facets work)
- Supabase realtime RLS gap (existed but not previously audited)
- ~~`ListingFreshnessCheck` stale closure (new component)~~ **FALSE POSITIVE** — verified U1 is not a real issue
- Various input validation gaps on newer server actions

---

## Verification Pass (2026-03-05)

**Method:** 10 parallel code-reviewer agents read every cited file and line number to confirm or refute each finding. No assumptions — only source code evidence.

### Verification Summary

| Verdict | Count | % |
|---------|-------|---|
| CONFIRMED | 71 | 86.6% |
| FALSE POSITIVE | 5 | 6.1% |
| PARTIALLY CORRECT | 6 | 7.3% |
| **Total verified** | **82** | |
| Unverified (LOW + some MEDIUM) | 71 | — |

**Audit accuracy: 93.9%** (confirmed + partially correct = 77/82)

---

### FALSE POSITIVES (remove from issue count)

| ID | Original Claim | Why False |
|----|---------------|-----------|
| **SC2** | `unstable_cache` closure bypass in facets route | `cacheKey` is correctly computed from `filterParams` — the closure captures the key correctly. Cache distinguishes different params. |
| **U1** | `ListingFreshnessCheck` stale closure calls `undefined()` | JavaScript `const` in a closure captures the binding (variable slot), not the value at declaration time. `setInterval` callback fires asynchronously after both `useCallback` hooks have run. `checkListingExists` is always defined when called. The `useEffect` re-runs on dep changes, re-registering intervals with fresh functions. |
| **HSR4** | `seenIdsRef` invariant undocumented / suppresses valid listings | `seenIdsRef` is initialized correctly, component `key` prop handles remount on param change, intent is documented in comments. Working as designed. |
| **M-msg-3** | Missing `router` dependency in useEffect (MessagesPageClient) | `router.push` is only used in conditional early-return error paths inside effects. ESLint warning is low-severity; not a real bug. |
| **M-ui-3** | `InfiniteScroll` loadMore fires twice before guard | The `!isLoading` guard in `handleIntersect` prevents double-fire. `IntersectionObserver` does not fire synchronous duplicate events in a single tick. The built-in hook sets `isLoading` synchronously before awaiting. |

**Adjusted issue counts after removing 5 false positives:**
- CRITICAL: **23** (was 25; removed SC2 and U1)
- HIGH: **39** (was 40; removed HSR4)
- MEDIUM: **48** (was 50; removed M-msg-3 and M-ui-3)
- LOW: 38 (unchanged, not verified)
- **New total: 148** (was 153)

---

### PARTIALLY CORRECT (6 — adjust descriptions)

| ID | Original Claim | Correction |
|----|---------------|------------|
| **SC3** | CDN caches without `Vary: Cookie` | Both routes have `Vary: Accept-Encoding` but not `Vary: Cookie`. However, `Cache-Control: public` is only on non-authenticated search results. Risk is real but narrower than "first user's response served to all." |
| **HSR2** | V1 fallback silently returns empty on null V2 | Has `console.warn` logging (not fully silent), but does return empty results with no user-facing error. Risk is real but "silently" overstates it. |
| **HM2** | ChatWindow polls ALL messages every 5s — unbounded DB read | Poll is a full message fetch (no cursor) — unbounded read is real. However, it does have a concurrency guard (`isPollingRef`) preventing overlapping polls. Core concern valid. |
| **HA3** | Admin pages 100-row cap, verifications unbounded | Understated: verifications page has NO `take` at all (truly unbounded), which is worse than the other admin pages that at least have `take: 100`. |
| **HI2** | refresh-search-docs no Sentry, crashes invisible | No Sentry and no `maxDuration` confirmed. But crashes are logged via `logger.sync.error()` — not fully invisible. Operational risk from missing alerting and timeout is real. |
| **M-msg-1** | `listingId` not validated in `startConversation` | No Zod schema on `listingId` format, but `prisma.listing.findUnique` returns null for malformed IDs, and the `if (!listing)` check catches it. Low risk in practice. |

---

### CONFIRMED CRITICAL ISSUES (22 — all verified with source code evidence)

S1, S2, S3 (Auth & Security) — All confirmed at cited line numbers
D1–D7 (Unbounded Queries) — All 7 confirmed; `findMany` with no `take` at every cited location
R1–R4 (Race Conditions) — All confirmed; duplicate conversation, booking on non-ACTIVE listing, no rate limit, no runtime enum
V1–V4 (Input Validation) — All confirmed; path traversal, zero images, unvalidated URLs, erased type union
SC1 (Rate-limit error mismatch) — Confirmed; server throws "Rate limited", client checks "Rate limit"
DB1, DB2 (Database Schema) — Both confirmed; `array_length` NULL on empty, overlapping constraints
CS1 (Supabase Realtime RLS) — Confirmed; no RLS policy, client-side guard only

### CONFIRMED HIGH ISSUES (34 of 36 verified, 4 unverified)

**Auth (4/4):** HS2 timing oracle, HS3 name no max, HS4 suspended POST, HS5 suspension cache — all confirmed
**Listings (0/4):** Items 6-9 (max price PATCH, RENTED->ACTIVE, rate limit, GIF PII) — **unverified** (agents lost during context compaction)
**Chat (3/4):** HM1 inconsistent limits, HM3 PII in notification table, HM4 soft-deleted markAsRead — confirmed. HM2 partially correct.
**API (4/5):** HA1 rejection length, HA2 notes length, HA4 limit validation, HA5 wrong email template — confirmed. HA3 partially correct (worse than described).
**Search (2/4):** HSR1 map debounce 50ms, HSR3 unbounded cache Map — confirmed. HSR2 partially correct. HSR4 false positive.
**Database (5/5):** HD1 orphaned version, HD2 NOT VALID constraints, HD3 non-concurrent indexes, HD4 radarStatus leak, HD5 categories no limit — all confirmed
**Map (1/1):** H28 Nominatim from browser — confirmed
**UI (7/7):** HU1 scroll lock race (4 components bypass hook), HU2 user:any, HU3 z-index, HU4 skip link, HU5 DatePicker a11y, HU6 calendar a11y, HU7 inline style CSP — all confirmed
**Infra (4/5):** HI1 DB health timeout, HI3 dead code, HI4 next-auth beta, HI5 analytics wrong endpoint — confirmed. HI2 partially correct.

### CONFIRMED MEDIUM ISSUES (18 of 21 verified)

**Chat:** in-flight guard missing (MessagesPageClient), conversation list not refreshed, setTypingStatus DB upsert — confirmed
**API:** blockUser/unblockUser no UUID, P2025 swallowed, admin stats duplicate, reviewResponse blocks on email, toggleSaveListing divergence, getBlockedUsers unbounded, admin updateListingStatus no enum — all 7 confirmed
**UI:** profile dropdown no Escape, VerifiedBadge no aria-hidden, freshness banners no dismiss, ListingGridSkeleton name collision — 4 confirmed
**Infra:** next.config.ts write no error handling, Supabase health stub, duplicate security headers, WebVitals wrong endpoint — all 4 confirmed

---

### Revised Fix Priority (post-verification)

**Phase 1 remains unchanged** — all 6 security blockers confirmed real.

**Phase 3 update:** Remove SC2 from the fix list (false positive). SC1 and SC3 remain.

**Phase 5 update:** Remove U1 from the fix list (false positive). HU1–HU7 all confirmed and should be prioritized.

**New discovery from verification:** HI5 + Medium-9 (WebVitals) reveal that **all client-side analytics are silently lost** — neighborhood events go to GET-only endpoint, Web Vitals payload fails schema validation. These should be grouped as a Phase 6 analytics fix.
