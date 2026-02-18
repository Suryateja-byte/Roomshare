# Roomshare Production Readiness Audit — Consolidated Report

**Date**: 2026-02-16
**Agents**: 7 Opus 4.6 agents (security, API, database, testing, frontend, performance, ops)
**Scope**: Full codebase — 31 API routes, 17 server actions, 149 components, 24 DB models, 451-line schema, 21 migrations, 3 Sentry configs, Playwright + Jest infrastructure

---

## Executive Summary

**Total findings: 157** across 7 audit domains.

| Severity | Count | Must-fix timeline |
|----------|-------|-------------------|
| CRITICAL | 22 | Before production launch |
| HIGH | 44 | Before production launch |
| MEDIUM | 51 | Within first 2 weeks post-launch |
| LOW | 40 | Backlog / nice-to-have |

The codebase has strong fundamentals — robust booking state machine, solid idempotency, good token security, comprehensive E2E tests, well-designed structured logger, and proper auth patterns. However, several critical gaps must be addressed: **the deleted middleware means zero security headers are applied**, **Sentry is blind to all server-side errors**, **missing DB indexes will cause performance degradation at scale**, and **several endpoints lack authentication or rate limiting**.

---

## P0: CRITICAL — Must Fix Before Launch (22 findings)

### Security & Headers
| # | Finding | Source | File(s) |
|---|---------|--------|---------|
| 1 | **middleware.ts deleted — ALL security headers (CSP, HSTS, X-Frame-Options) not applied** | Security, API | `src/middleware.ts` (deleted) |
| 2 | `/api/chat` (LLM) has no authentication — anyone can invoke Groq API | Security | `src/app/api/chat/route.ts` |
| 3 | `/api/agent` (n8n webhook) has no authentication | Security | `src/app/api/agent/route.ts` |
| 4 | `incrementViewCount` has zero auth and zero rate limiting — view count inflation | API | `src/app/actions/listing-status.ts` |

### Data Integrity & Race Conditions
| # | Finding | Source | File(s) |
|---|---------|--------|---------|
| 5 | Listing deletion race condition — non-atomic check-then-delete allows orphaned bookings | API | `src/app/api/listings/[id]/route.ts` |
| 6 | Verification approval non-transactional — request approved but user stays unverified | API | `src/app/actions/verification.ts` |
| 7 | Rate limiter TOCTOU race — concurrent requests bypass count check | DB, API | `src/lib/rate-limit.ts` |
| 8 | `Float` for monetary values (price, totalPrice) — precision errors on financial math | DB | `prisma/schema.prisma` |
| 9 | No CHECK constraint on Review.rating (1-5) — bad values corrupt search rankings | DB | `prisma/schema.prisma` |

### Missing Database Indexes (Performance Critical)
| # | Finding | Source | File(s) |
|---|---------|--------|---------|
| 10 | Missing index on `Listing.ownerId` — every ownership query is a full scan | DB | `prisma/schema.prisma` |
| 11 | Missing indexes on `Booking.listingId` and `Booking.status` — capacity checks scan full table | DB, Perf | `prisma/schema.prisma` |
| 12 | Missing index on `Review.listingId` — every listing review fetch + search JOIN is unindexed | DB | `prisma/schema.prisma` |

### Observability Blindness
| # | Finding | Source | File(s) |
|---|---------|--------|---------|
| 13 | No Sentry webpack plugin — source maps never uploaded, stack traces are minified | Ops | `next.config.ts` |
| 14 | Zero `Sentry.captureException` in ANY API route — all server errors invisible | Ops | All 32 API routes |

### Performance
| # | Finding | Source | File(s) |
|---|---------|--------|---------|
| 15 | V1 `getListings()` loads ALL rows into memory, filters in JS — O(N) full scan | DB, Perf | `src/lib/data.ts:442-714` |
| 16 | Cron upserts 100 rows one-at-a-time (100 sequential DB round-trips) | Perf | `src/app/api/cron/refresh-search-docs/route.ts` |
| 17 | `analyzeFilterImpact()` runs 7 sequential COUNT queries on zero-result searches | Perf | `src/lib/data.ts:1507-1616` |

### Data Exposure
| # | Finding | Source | File(s) |
|---|---------|--------|---------|
| 18 | Listing detail page exposes password hash — `include: { owner: true }` | DB | `src/app/listings/[id]/page.tsx:41-47` |

### Frontend Safety
| # | Finding | Source | File(s) |
|---|---------|--------|---------|
| 19 | Booking confirmation modal missing FocusTrap — financial dialog, keyboard can escape | Frontend | `src/components/BookingForm.tsx:682-795` |
| 20 | Block-user dialog missing FocusTrap — safety action without focus containment | Frontend | `src/components/BlockUserButton.tsx` |
| 21 | Listing detail page missing `error.tsx` — highest-traffic dynamic page | Frontend | `src/app/listings/[id]/` |
| 22 | Listing edit page missing `error.tsx` — form errors show raw crash | Frontend | `src/app/listings/[id]/edit/` |

---

## P1: HIGH — Should Fix Before Launch (44 findings)

### Security & Auth Gaps
| # | Finding | Source |
|---|---------|--------|
| 23 | 11 `$queryRawUnsafe` call sites — SQL injection surface (currently parameterized but fragile) | Security |
| 24 | PII (userEmail) in admin audit logs — violates non-negotiable | Security |
| 25 | Dev mode leaks password reset URL in response body | Security |
| 26 | PATCH /api/listings missing suspension & email verification checks | API |
| 27 | Messages POST stores raw content instead of trimmed Zod output | API |
| 28 | `updateListingStatus` accepts any string as status (no runtime validation) | API |
| 29 | Reviews POST missing email verification check | API |
| 30 | `getFilterSuggestions` server action — no auth, no rate limiting, no input validation | API |
| 31 | `getListingsInBounds` server action — no auth, no rate limiting (scraping vector) | API |
| 32 | `updateNotificationPreferences` stores unvalidated JSON via `as any` cast | API |
| 33 | `changePassword`, `deleteAccount`, `verifyPassword` all lack rate limiting (brute-force) | API |

### Missing Database Indexes
| # | Finding | Source |
|---|---------|--------|
| 34 | Missing index on `Listing.status` — used in virtually every listing query | DB |
| 35 | Missing index on `Review.targetUserId` — user profile review lookups | DB |
| 36 | Missing index on `Report.status` and `Report.listingId` — admin panel queries | DB |
| 37 | Missing index on `Conversation.listingId` — conversation start queries | DB |
| 38 | No `updatedAt` on User, Report, Notification models | DB |
| 39 | `getMyBookings()` fetches full Location including PostGIS coords binary | DB |

### Observability
| # | Finding | Source |
|---|---------|--------|
| 40 | ~50% of API routes use raw `console.error` instead of structured logger | Ops |
| 41 | 11 pages missing `error.tsx` boundaries (auth pages, listings/create) | Ops, Frontend |
| 42 | Cron jobs don't report errors to Sentry | Ops |

### Performance
| # | Finding | Source |
|---|---------|--------|
| 43 | Geocoding cache in-memory only — lost on every serverless cold start | Perf |
| 44 | Duplicate map data fetching on V1 path (separate query from search results) | Perf |
| 45 | `sendMessage` notification loop is sequential per participant | Perf |
| 46 | `framer-motion` (~32KB) imported in 10 client components | Perf |
| 47 | SessionProvider polls every 60s (should be 300s) | Perf |
| 48 | Notification polling every 30s without tab visibility check | Perf |

### Frontend
| # | Finding | Source |
|---|---------|--------|
| 49 | ErrorBoundary fallback has no dark mode support — unreadable in dark mode | Frontend |
| 50 | Auth pages (login, signup, forgot-password, reset-password) missing error.tsx | Frontend |
| 51 | Listings/create page missing error.tsx — upload failures lose user's work | Frontend |
| 52 | 87% of components are client components (~15-20 should be server) | Frontend |
| 53 | Map debounce 500ms instead of required 600ms per CLAUDE.md spec | Frontend |

### Test Coverage (Critical Gaps)
| # | Finding | Source |
|---|---------|--------|
| 54 | `token-security.ts` has zero tests — crypto token hashing/creation | Testing |
| 55 | `actions/suspension.ts` has no tests — suspension bypass risk | Testing |
| 56 | `api/listings/[id]/status` has no tests — state transitions untested | Testing |
| 57 | `api/chat` and `api/agent` routes have no tests | Testing |
| 58 | `auth.ts` / `auth.config.ts` have no direct tests — only mocked | Testing |
| 59 | Zero real database integration tests — all Prisma mocked | Testing |
| 60 | `notifications.ts`, `normalize-email.ts`, `pagination-schema.ts` untested | Testing |
| 61 | `search-v2-service.ts` untested — core search orchestration | Testing |
| 62 | 7 hooks, 3 contexts, FilterModal, ErrorBoundary all missing tests | Testing |
| 63 | Cron jobs and health endpoints have no tests | Testing |
| 64 | `$transaction` mock passes empty object — hides real failures | Testing |
| 65 | No shared test factories — data recreated inline everywhere | Testing |
| 66 | `global.fetch = jest.fn()` fragile pattern in several tests | Testing |

---

## P2: MEDIUM — Fix Within 2 Weeks Post-Launch (51 findings)

### Security
- CSP `style-src 'unsafe-inline'` in all environments
- CSP `img-src https:` overly permissive (any HTTPS origin)
- `allowDangerousEmailAccountLinking` residual risk (needs dedicated test)
- Rate limiting disabled in non-production (staging exposed)
- Listing status endpoint has no rate limiting (enumeration vector)
- Health/ready endpoint exposes raw error details
- Review PUT/DELETE missing suspension check

### API & Server
- Missing JSON parse error handling on favorites/reports/reviews POST routes
- `/api/verify` leaks raw error details in production
- Duplicated `normalizeStringList` utility
- Server actions systematically lack rate limiting (chat, saved-listings, notifications)
- `pollMessages` redundant conversation verification
- `createListing` error message leaks internal details
- Chat email notification sends full message (inconsistent truncation)

### Database
- Account.userId and Session.userId have no index (NextAuth per-request queries)
- No CHECK constraints on Listing.price (>=0) or slots (>0)
- SearchDoc table not in Prisma schema (no type safety)
- FTS backfill migration runs unbatched UPDATE
- Redundant location deleteMany before cascade delete
- No index on Notification.createdAt (sort column)
- No index on Listing.createdAt (V1 sort column)

### Observability
- No Sentry release/environment tags
- Metrics endpoint lacks error rate and request duration
- Sentry client config filters too aggressively (drops "fetch" errors)
- Graceful shutdown Sentry flush timeout too short (2s)
- Docker compose lacks resource limits and health check
- No retry logic for cron job DB operations
- `verify/route.ts` leaks raw error in response

### Frontend
- Minimal a11y test coverage (2 files)
- SearchResultsClient missing `role="article"` on feed items
- Map popup not keyboard-dismissible (Escape)
- `FeaturedListings.tsx` uses `'use server'` incorrectly
- Map tile loading flicker on cached tiles
- Missing route-specific `not-found.tsx` for listings
- BookingForm logs idempotency key to console

### Performance
- search-count endpoint has no caching
- `getListingsPaginated` runs separate COUNT query
- O(n) `savedListingIds.includes()` per card (should be Set)
- `toggleSaveListing` find-then-delete (2 round-trips vs upsert)
- `getNotifications` runs 3 queries (1 redundant)
- 1.4MB unoptimized images in /public (hero images)
- Dead `optimizePackageImports` entries in next.config.ts
- Large inline config data in nearby route (~450 lines)

---

## P3: LOW — Backlog (40 findings)

Includes: TypingStatus unbounded growth, IdempotencyKey mixed ID formats, sitemap no pagination, SavedSearch.filters untyped JSON, minor ARIA gaps (aria-expanded, skip-to-search), Escape key conflicts between sheet/modals, timezone edge case tests, ServiceWorker interval leak, geocoding cache eager eviction, dead POST export on search-alerts cron, console PII in scripts, response over-sharing on register, process fingerprinting via metrics, minor non-atomic but DB-constrained operations, JWT refresh timing gap.

---

## Top 10 Priority Actions (Ordered by Impact)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| **1** | **Restore `src/middleware.ts`** — wire CSP + security headers | Small | Fixes C1: ALL security headers missing |
| **2** | **Add Sentry server-side error capture** — create shared API error handler + wire `withSentryConfig` | Medium | Fixes C13-14: blind to all server errors |
| **3** | **Add missing DB indexes** (Listing.ownerId, Booking.listingId+status, Review.listingId, Listing.status + 5 more) | Small | Fixes C10-12, H34-37: prevents full-table scans |
| **4** | **Fix password hash exposure** on listing detail page | Tiny | Fixes C18: user passwords leaked to client |
| **5** | **Add auth to `/api/chat` and `/api/agent`** | Small | Fixes C2, H2: unauthenticated LLM/webhook access |
| **6** | **Add FocusTrap to booking confirmation + block-user dialogs** | Small | Fixes C19-20: a11y on financial/safety dialogs |
| **7** | **Add rate limiting to server actions** (password, view count, filters, map bounds) | Medium | Fixes C4, H30-33: brute-force + abuse vectors |
| **8** | **Fix listing deletion race condition** — wrap in transaction with FOR UPDATE | Small | Fixes C5: orphaned bookings |
| **9** | **Batch cron upserts** + parallelize filter impact queries | Medium | Fixes C16-17: 100x fewer DB round-trips |
| **10** | **Migrate Float to Decimal** for monetary values | Medium | Fixes C8: financial precision errors |

---

## Strengths (What's Working Well)

The audit found substantial positive patterns:

- **Booking state machine**: FOR UPDATE locks, serializable isolation, idempotency keys, retry on serialization conflict
- **Token security**: SHA-256 hashed tokens, constant-time comparison, never storing raw values
- **Rate limiting architecture**: Dual-layer DB + Redis, in-memory fallback, circuit breaker
- **Structured logger**: PII redaction, JSON output, request context correlation
- **Auth configuration**: Turnstile CAPTCHA, email normalization, suspension checks, timing-safe anti-enumeration
- **Upload security**: Magic bytes validation, MIME allowlist, 5MB max, path traversal prevention
- **E2E test suite**: 100+ Playwright specs, cross-browser, mobile, a11y, visual regression, performance
- **Search pagination**: Proper cursor reset, deduplication via seenIdsRef, 60-item cap
- **Graceful shutdown**: SIGTERM/SIGINT handling, Sentry flush, Prisma disconnect
- **Health checks**: Liveness + readiness with DB latency timing
- **CRON auth**: 32-char secret requirement with placeholder rejection
- **Error type hierarchy**: DataError with Prisma error mapping
