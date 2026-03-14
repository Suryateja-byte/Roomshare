# ROOMSHARE: Codebase-Tailored Implementation Guide

## Multi-Slot & Whole-Room Booking System

**Mapped to Actual Files, Functions, Line Numbers, and Existing Patterns**

| Field | Value |
|-------|-------|
| Architecture | v2.0 + v2.1 Patches |
| Adaptation | 38-Question Codebase Audit + Deep Code Review + Industry Research |
| Prepared By | Surya Devera Konda |
| Stack | Next.js 14+ / Prisma 6.x / PostgreSQL (Vercel + Supabase Storage) |
| Date | March 9, 2026 (revised March 10, 2026) |
| Input Documents | v2.0 Plan + v2.1 Patches + 38-Q Codebase Audit + 8-Agent Code Review |
| Cron Runtime | Vercel Cron (NOT pg_cron) |
| Feature Flags | Zod-validated env vars in `src/lib/env.ts` |
| Revision | v3.0 — 4-agent parallel code review (Arch/Security/Testing/UI-UX), 25 fixes integrated |

---

## Table of Contents

1. [Critical Codebase Adaptations](#1-critical-codebase-adaptations)
2. [Exact File Change Map](#2-exact-file-change-map)
3. [Existing Data Migration Strategy](#3-existing-data-migration-strategy)
4. [Test File Mapping](#4-test-file-mapping)
5. [Phased Rollout Timeline](#5-phased-rollout-timeline)
6. [Pre-Implementation Checklist](#6-pre-implementation-checklist)
7. [Industry Best Practices Applied](#7-industry-best-practices-applied)
8. [Risk Register](#8-risk-register)
9. [Feature Flag Safety Matrix](#9-feature-flag-safety-matrix)

---

## 1. Critical Codebase Adaptations

The v2.0/v2.1 plan was written without knowledge of this codebase. The 38-question audit + deep code review revealed **11 critical adaptations** required before implementation. These are not optional -- ignoring any one of them will cause failures.

### 1.1 Adaptation: pg_cron -> Vercel Cron

> **CRITICAL PLATFORM MISMATCH**

The plan assumes pg_cron (Supabase's PostgreSQL extension). Your database is standard PostgreSQL on Vercel, NOT Supabase DB. pg_cron is not available. All cron jobs must use Vercel Cron via `vercel.json`, matching the existing pattern of your 5 cron routes.

**What changes:**

The hold-expiry sweeper becomes a new Vercel Cron route at `src/app/api/cron/expire-held-bookings/route.ts`, protected by `validateCronAuth()` from `src/lib/cron-auth.ts` (timing-safe comparison using `CRON_SECRET`), matching the exact pattern of your existing `cleanup-idempotency-keys` and `refresh-search-docs` routes.

```json
// vercel.json additions:
{ "path": "/api/cron/expire-held-bookings", "schedule": "*/5 * * * *" }
{ "path": "/api/cron/reconcile-slots", "schedule": "0 3 * * 0" }
```

**Existing cron routes (5 total) for reference:**

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/search-alerts` | `0 9 * * *` | Daily saved search emails |
| `/api/cron/cleanup-rate-limits` | `0 3 * * *` | Purge expired rate limit entries |
| `/api/cron/refresh-search-docs` | `*/5 * * * *` | Sync dirty listing_search_docs |
| `/api/cron/cleanup-typing-status` | `*/5 * * * *` | Purge stale typing status |
| `/api/cron/cleanup-idempotency-keys` | `0 4 * * *` | Purge expired idempotency keys |

All use: HTTP GET + `validateCronAuth(request)` + JSON response `{ success, count/processed, timestamp }`.

**Vercel timeout awareness:** Hobby plan = 10s, Pro = 60s. Sweeper must use batch sizes that complete within the budget. Recommended: `LIMIT 50` per batch with `FOR UPDATE SKIP LOCKED`.

### 1.2 Adaptation: Phase 0 Drift Cleanup (Prerequisite)

> **SCHEMA/DB OUT OF SYNC**

Your database has tables, enums, and columns that `prisma/schema.prisma` doesn't know about. Running `prisma migrate dev` will generate a destructive migration. This MUST be resolved first.

**Full drift inventory (from migration analysis):**

| DB Object | Type | Created By Migration | In schema.prisma? |
|-----------|------|---------------------|--------------------|
| `SleepingSpot` table | Table | `20260102000000_phase1_sleeping_spot` | No |
| `SpotWaitlist` table | Table | `20260102000000_phase1_sleeping_spot` | No |
| `SpotStatus` enum | Enum | `20260102000000_phase1_sleeping_spot` | No |
| `BookingStatusV2` enum | Enum | `20260102000000_phase1_sleeping_spot` | No |
| `WaitlistStatus` enum | Enum | `20260102000000_phase1_sleeping_spot` | No |
| `Booking.spotId` | Column | `20260102000000_phase1_sleeping_spot` | No |
| `Booking.statusV2` | Column | `20260102000000_phase1_sleeping_spot` | No |
| `Booking.holdOfferedAt` | Column | `20260102000000_phase1_sleeping_spot` | No |
| `Booking.holdExpiresAt` | Column | `20260102000000_phase1_sleeping_spot` | No |
| `Booking.offerAcceptedAt` | Column | `20260102000000_phase1_sleeping_spot` | No |
| `Booking.offerExpiresAt` | Column | `20260102000000_phase1_sleeping_spot` | No |
| `Booking.moveInConfirmedAt` | Column | `20260102000000_phase1_sleeping_spot` | No |
| `booking_version_positive` | CHECK constraint | `20260102000000_phase1_sleeping_spot` | No (safe to keep — enforces version > 0) |
| `Booking_v2_by_spot_idx` | Index | `20260102000000_phase1_sleeping_spot` | No (orphaned after column drop) |
| `Booking_v2_active_status_idx` | Index | `20260102000000_phase1_sleeping_spot` | No (orphaned after column drop) |
| `Listing.version` | Column | `20260101000000_phase0_idempotency_fix` | No (resolve by adding to schema.prisma) |
| `User.subscriptionTier` | Column | `20251221100000_add_neighborhood_intelligence` | No |
| `NeighborhoodCache` table | Table | `20251221100000_add_neighborhood_intelligence` | No |

**Decision:** Abandon Phase 1 SleepingSpot model and clean up ALL drift. Rationale: Phase 1 was never wired into application code, columns have no production data, and it conflicts with the v2.1 approach.

**Cleanup Migration Steps** -- `20260310000000_cleanup_phase1_drift`:

```sql
-- Phase 1 tables
DROP TABLE IF EXISTS "SpotWaitlist" CASCADE;
DROP TABLE IF EXISTS "SleepingSpot" CASCADE;

-- Phase 1 enums
DROP TYPE IF EXISTS "SpotStatus";
DROP TYPE IF EXISTS "BookingStatusV2";
DROP TYPE IF EXISTS "WaitlistStatus";

-- Phase 1 booking columns
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "spotId";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "statusV2";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "holdOfferedAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "holdExpiresAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "offerAcceptedAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "offerExpiresAt";
ALTER TABLE "Booking" DROP COLUMN IF EXISTS "moveInConfirmedAt";

-- Phase 1 CHECK constraints on bookings
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_hold_offered_shape";
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_under_offer_shape";
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_move_in_confirmed_shape";

-- Phase 1 orphaned indexes (columns being dropped make these dead)
DROP INDEX IF EXISTS "Booking_v2_by_spot_idx";
DROP INDEX IF EXISTS "Booking_v2_active_status_idx";

-- Neighborhood intelligence drift (unused feature)
DROP TABLE IF EXISTS "NeighborhoodCache" CASCADE;
ALTER TABLE "User" DROP COLUMN IF EXISTS "subscriptionTier";

-- Safety constraint: prevent availableSlots from going negative (defense-in-depth)
ALTER TABLE "Listing" ADD CONSTRAINT "listing_available_slots_non_negative"
  CHECK ("availableSlots" >= 0) NOT VALID;
ALTER TABLE "Listing" VALIDATE CONSTRAINT "listing_available_slots_non_negative";
```

**Schema.prisma edit** (REQUIRED — do this BEFORE running `prisma db pull`):

```prisma
// Listing model -- add version (already exists in DB via phase0_idempotency_fix migration)
model Listing {
  // ... existing fields ...
  version Int @default(1)  // ADD THIS LINE
}
```

> **IMPORTANT:** This is a schema.prisma edit, NOT a migration. The column already exists in the DB. The edit makes Prisma aware of it. Do this BEFORE running the verification commands below.

**Post-cleanup verification:**

```bash
npx prisma db pull        # Verify introspected schema matches schema.prisma
npx prisma migrate dev    # Should produce no diff
npx prisma generate       # Regenerate client
```

**Do NOT reuse Phase 1 column names.** The feasibility report suggested reusing `holdExpiresAt`/`holdOfferedAt`. Since we're dropping them in cleanup, we'll use the plan's names (`heldUntil`/`heldAt`) for clarity. Fresh columns, no legacy confusion.

### 1.3 Adaptation: Keep startDate/endDate (Not moveInDate/moveOutDate)

The plan uses `moveInDate`/`moveOutDate` on Booking. Your codebase uses `startDate`/`endDate` on Booking (`prisma/schema.prisma:183-184`), with a unique constraint on `[tenantId, listingId, startDate, endDate]`. The Listing model has a separate `moveInDate` field (`prisma/schema.prisma:117`) for listing-level preferred move-in.

**Decision:** Keep `startDate`/`endDate`. Every reference to `moveInDate`/`moveOutDate` in the plan's overlap queries maps to `startDate`/`endDate`. No rename.

### 1.4 Adaptation: Feature Flags via env.ts

> **CRITICAL: Use z.enum, NOT z.coerce.boolean()**

The plan proposes feature flags per phase. Your codebase uses Zod-validated env vars in `src/lib/env.ts` (lines 314-411). We MUST match the existing pattern exactly — `z.coerce.boolean()` will treat the string `"false"` as truthy, turning all flags ON by default in Vercel where env vars are always strings.

```typescript
// src/lib/env.ts additions (inside the features object):
ENABLE_MULTI_SLOT_BOOKING: z.enum(["true", "false"]).optional(),  // Phase 2
ENABLE_WHOLE_UNIT_MODE: z.enum(["true", "false"]).optional(),     // Phase 3
ENABLE_SOFT_HOLDS: z.enum(["true", "false"]).optional(),          // Phase 4
ENABLE_BOOKING_AUDIT: z.enum(["true", "false"]).optional(),       // Phase 5
```

**Runtime getters** (following existing `features.searchDoc` pattern at line ~410):

```typescript
get multiSlotBooking() { return e.ENABLE_MULTI_SLOT_BOOKING === "true"; },
get wholeUnitMode() { return e.ENABLE_WHOLE_UNIT_MODE === "true"; },
get softHolds() { return e.ENABLE_SOFT_HOLDS === "true"; },
get bookingAudit() { return e.ENABLE_BOOKING_AUDIT === "true"; },
```

**Cross-flag safety validation** (add Zod `superRefine` following existing Turnstile validation pattern at line ~109):

```typescript
.superRefine((data, ctx) => {
  if (data.ENABLE_WHOLE_UNIT_MODE === "true" && data.ENABLE_MULTI_SLOT_BOOKING !== "true") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ENABLE_WHOLE_UNIT_MODE requires ENABLE_MULTI_SLOT_BOOKING to be enabled",
    });
  }
  if (data.ENABLE_BOOKING_AUDIT === "true" && data.ENABLE_SOFT_HOLDS !== "true") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ENABLE_BOOKING_AUDIT requires ENABLE_SOFT_HOLDS for reconciliation correctness",
    });
  }
})
```

This ensures the server fails fast at startup with a clear error message rather than silently misbehaving. See Section 9 for the full flag interaction matrix.

### 1.5 Adaptation: Accept/Cancel Inventory Patterns Match Existing Code

> **CRITICAL: All decrements must use GREATEST floor clamp**

The plan uses raw SQL for inventory mutations. Your codebase uses **two patterns** which must be preserved — but the decrement path needs a floor clamp added:

**Accept path** (`src/app/actions/manage-booking.ts:~148`): Currently uses Prisma ORM `decrement`:
```typescript
{ availableSlots: { decrement: 1 } }
```

**Cancel of ACCEPTED path** (`src/app/actions/manage-booking.ts:~306-310`): Raw SQL with LEAST clamp:
```sql
UPDATE "Listing" SET "availableSlots" = LEAST("availableSlots" + 1, "totalSlots") WHERE "id" = $1
```

**Phase 2 adaptations:**
- Accept: Convert from Prisma ORM to raw SQL with GREATEST floor:
  ```sql
  UPDATE "Listing" SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
  WHERE id = ${listingId} AND "availableSlots" >= ${slotsRequested}
  ```
  If `rowCount = 0`: insufficient capacity, abort with error.
- Cancel of ACCEPTED: `+ booking.slotsRequested` instead of `+ 1` in LEAST clamp
- Accept capacity recheck: Change `COUNT(*)` to `COALESCE(SUM("slotsRequested"), 0)` of overlapping ACCEPTED bookings (excluding current). Update comparison from `count + 1 > listing.totalSlots` to `sum + booking.slotsRequested > listing.totalSlots`.

**Phase 4 adaptations (soft holds):**
- Accept (flag ON): No inventory change (slots already held at creation)
- Cancel of HELD: Release inventory with LEAST clamp using `booking.slotsRequested`, guarded by `heldUntil >= NOW()` **atomically in the WHERE clause** (not a pre-check):
  ```sql
  UPDATE "Booking" SET status = 'CANCELLED', "updatedAt" = NOW(), version = version + 1
  WHERE id = ${bookingId} AND status = 'HELD' AND "heldUntil" >= NOW() AND version = ${version}
  ```
  If `rowCount = 0`: check if status is EXPIRED → return `already_expired`, else return `CONCURRENT_MODIFICATION`.
- `createBooking` (flag ON): Atomic capacity decrement via raw SQL with `GREATEST` floor clamp

### 1.6 Adaptation: SearchDoc Denormalized Table

Your search uses a denormalized `listing_search_docs` table (34 columns) with dirty-flag sync (`src/lib/search/search-doc-sync.ts` + `refresh-search-docs` cron). Any new columns on Listing (`bookingMode`, `holdTtlMinutes`) or new computed fields (`effectiveAvailable`) must be added to:

1. **`listing_search_docs` table** (migration SQL)
2. **`search-doc-sync.ts`** — the `fetchListingSearchData` query (line ~72) and `upsertSearchDocument` INSERT/UPDATE (line ~98)
3. **`search-doc-queries.ts`** — the `buildSearchDocWhereConditions` function (line ~430)
4. **`src/app/api/search/facets/route.ts`** — line 172: `d.available_slots > 0` (must also use ghost-hold effective_available)

**New search doc columns:**

```sql
ALTER TABLE listing_search_docs ADD COLUMN booking_mode TEXT DEFAULT 'PER_SLOT';
ALTER TABLE listing_search_docs ADD COLUMN effective_available INT;
-- effective_available computed on sync: availableSlots + expired ghost holds
```

**Ghost-hold LEFT JOIN for `fetchListingSearchData`** (add to the existing raw SQL query):

```sql
-- Inside fetchListingSearchData, add this LEFT JOIN and computed column:
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(b."slotsRequested"), 0)::int AS ghost_slots
  FROM "Booking" b
  WHERE b."listingId" = l.id
    AND b.status = 'HELD'
    AND b."heldUntil" < NOW()
) ghost ON true

-- In the SELECT clause, add:
l."availableSlots" + ghost.ghost_slots AS effective_available
```

**Ghost-hold LEFT JOIN for `data.ts` search queries** (same pattern at lines ~327, ~600, ~843, ~1164):

```sql
-- Add to each query's FROM/JOIN section:
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(b."slotsRequested"), 0)::int AS ghost_slots
  FROM "Booking" b
  WHERE b."listingId" = l.id
    AND b.status = 'HELD'
    AND b."heldUntil" < NOW()
) ghost ON true

-- Replace availability filter:
-- OLD: l."availableSlots" >= ${minSlots || 1}
-- NEW: (l."availableSlots" + ghost.ghost_slots) >= ${minSlots || 1}
```

### 1.7 Adaptation: Notification Extension

Your notification system (in-app + Resend email with 3-retry circuit breaker via `src/lib/circuit-breaker.ts`) fires after booking status changes.

**Existing notification architecture:**
- In-app: `createInternalNotification()` from `src/lib/notifications.ts`
- Email: `sendNotificationEmailWithPreference()` from `src/lib/email.ts` — respects user's `notificationPreferences` JSON
- Templates: `src/lib/email-templates.ts` — HTML with `escapeHtml` + `sanitizeSubject`
- Circuit breaker: `failureThreshold: 5`, `resetTimeout: 60s`, 3 states (CLOSED/OPEN/HALF_OPEN)

**Pre-existing gap:** Cancellation currently sends only in-app notification (`BOOKING_CANCELLED`), no email. Fix this alongside the new notification types.

**New states need new notification types:**

| Event | Recipient | In-App Type | Email Template | Status |
|-------|-----------|-------------|----------------|--------|
| Booking held | Host | `BOOKING_HOLD_REQUEST` (new) | `bookingHoldRequest` (new) | NEW |
| Hold accepted | Tenant | `BOOKING_ACCEPTED` (existing) | `bookingAccepted` (existing) | EXISTS |
| Hold expired | Tenant | `BOOKING_EXPIRED` (new) | `bookingExpired` (new) | NEW |
| Hold expired | Host | `BOOKING_HOLD_EXPIRED` (new) | `bookingHoldExpired` (new) | NEW |
| Hold rejected | Tenant | `BOOKING_REJECTED` (existing) | `bookingRejected` (existing) | EXISTS |
| Booking cancelled | Host | `BOOKING_CANCELLED` (existing) | `bookingCancelled` (new) | FIX GAP |

**Files that must be updated for notification types:**

1. **`prisma/schema.prisma:300-309`** — extend `NotificationType` enum:
```prisma
enum NotificationType {
  // ... existing values ...
  BOOKING_HOLD_REQUEST   // NEW
  BOOKING_EXPIRED        // NEW
  BOOKING_HOLD_EXPIRED   // NEW
}
```

2. **`src/lib/notifications.ts`** — add new types to `NotificationType` TypeScript union (the type that gates `createInternalNotification`)

3. **`src/lib/email.ts`** — add entries to `emailTypeToPreferenceKey` map for hold lifecycle types so user notification preferences are respected

4. **`src/lib/email-templates.ts`** — add HTML templates for `bookingHoldRequest`, `bookingExpired`, `bookingHoldExpired`, and `bookingCancelled`

### 1.8 Adaptation: Listing Creation Lives in API Route (NOT Server Action)

> **CRITICAL FILE PATH CORRECTION**

The plan references `src/app/actions/listing.ts` for listing creation. **This file does not exist.** The `createListing` server action at `src/app/actions/create-listing.ts` is a deprecated stub that returns an error immediately. All real listing creation was migrated to:

**`src/app/api/listings/route.ts`** (POST handler)

Key details from the live implementation:
- `roomType` is a raw string (`roomType || null`) from Zod-validated body
- `totalSlots` comes from form input
- `availableSlots` is always initialized equal to `totalSlots` (line ~296-297)
- No `bookingMode` field exists anywhere in the current codebase

All Phase 3 references to "modify listing creation" must target `src/app/api/listings/route.ts`, not `src/app/actions/listing.ts`.

### 1.9 Adaptation: Dual FilterParams Interfaces

The codebase has **two** `FilterParams` interfaces:

1. **`src/lib/search-types.ts:57-80`** — used by the data layer (includes `page`, `limit`, `sort`, `nearMatches`)
2. **`src/lib/search-params.ts:20-40`** — used by URL parsing (excludes `page`, `limit`)

Both must be updated when adding `minAvailableSlots`. Additionally:
- The `FILTER_QUERY_KEYS` constant in `search-params.ts` (line ~110) must include `"minSlots"` or the canonical param will be dropped during cache-key building
- `buildCanonicalFilterParamsFromSearchParams` must parse and serialize `minAvailableSlots`
- The `useBatchedFilters` hook (`src/hooks/useBatchedFilters.ts`) owns all filter state for the modal UI and must be updated

### 1.10 Adaptation: Rate Limiting on createBooking

> **CRITICAL SECURITY GAP**

`createBooking` in `src/app/actions/booking.ts` currently has **no rate limiting**. The idempotency wrapper only protects against identical keys; different keys bypass it. A user can call `createBooking` in a loop.

**Fix:** Add rate limit BEFORE the SERIALIZABLE transaction (not inside it — `checkRateLimit` does its own DB operations that would cause P2034 serialization conflicts):

```typescript
// At top of createBooking, before Zod parse:
await checkRateLimit(userId, 'createBooking', RATE_LIMITS.createBooking);
```

```typescript
// In src/lib/rate-limit.ts, add:
createBooking: { limit: 10, windowMs: 60 * 60 * 1000 },  // 10 per hour
```

### 1.11 Adaptation: Inventory Floor Clamp on All Decrements

> **CRITICAL: Prisma `{ decrement: N }` has no floor guard**

The existing accept path uses Prisma ORM `{ availableSlots: { decrement: 1 } }` which can push `availableSlots` below zero if concurrent operations compete. During the PENDING/HELD dual-path period, a PENDING accept decrements without any guard while a HELD booking's slot was already consumed at creation.

**Two-layer defense:**

1. **DB constraint** (added in Phase 0 cleanup migration — see Section 1.2):
```sql
ALTER TABLE "Listing" ADD CONSTRAINT "listing_available_slots_non_negative"
  CHECK ("availableSlots" >= 0);
```

2. **Application-level GREATEST floor** on all decrement paths:
```sql
-- For accept:
UPDATE "Listing"
SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
WHERE id = ${listingId} AND "availableSlots" >= ${slotsRequested}
-- rowCount = 0 means insufficient capacity → abort

-- For hold creation (Phase 4):
UPDATE "Listing"
SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
WHERE id = ${listingId} AND "availableSlots" >= ${slotsRequested}
```

---

## 2. Exact File Change Map

Every file that must be modified or created, mapped to the specific changes required. This is the implementation checklist.

### Phase 0: Schema Cleanup + Pre-existing Bug Fixes (Prerequisite)

| File | Action | Changes |
|------|--------|---------|
| `prisma/migrations/20260310000000_cleanup_phase1_drift/migration.sql` | CREATE | Drop SleepingSpot, SpotWaitlist tables; drop Phase 1 enums (SpotStatus, BookingStatusV2, WaitlistStatus); drop Phase 1 booking columns (spotId, statusV2, holdOfferedAt, holdExpiresAt, offerAcceptedAt, offerExpiresAt, moveInConfirmedAt); drop Phase 1 CHECK constraints (booking_hold_offered_shape, booking_under_offer_shape, booking_move_in_confirmed_shape); drop orphaned Phase 1 indexes (Booking_v2_by_spot_idx, Booking_v2_active_status_idx); drop NeighborhoodCache table; drop User.subscriptionTier column; add `listing_available_slots_non_negative` CHECK constraint |
| `prisma/schema.prisma` | MODIFY | Add `version Int @default(1)` to Listing model (already in DB — this is a schema sync, not a migration). Verify clean state after cleanup with `prisma db pull` |
| `src/lib/env.ts` | MODIFY | Add 4 feature flag env vars with `z.enum(["true", "false"]).optional()` pattern. Add runtime getters. Add `superRefine` cross-flag validation (WHOLE_UNIT requires MULTI_SLOT; BOOKING_AUDIT requires SOFT_HOLDS) |
| `src/lib/rate-limit.ts` | MODIFY | Add `createBooking: { limit: 10, windowMs: 60 * 60 * 1000 }` to `RATE_LIMITS` |
| `src/app/actions/booking.ts` | MODIFY | Add `checkRateLimit(userId, 'createBooking', RATE_LIMITS.createBooking)` before Zod parse |
| `src/app/listings/[id]/edit/EditListingForm.tsx:560-572` | MODIFY | Fix pre-existing bug: add `min="1" max="20" step="1"` to totalSlots Input (matches CreateListingForm which has these attributes) |
| `src/__tests__/api/cron/cleanup-idempotency-keys.test.ts` | CREATE | Add missing test for existing cron route (matches pattern of other cron tests: auth, defense-in-depth, success, error handling) |
| `src/lib/notifications.ts` | MODIFY | Add `BOOKING_HOLD_REQUEST`, `BOOKING_EXPIRED`, `BOOKING_HOLD_EXPIRED` to `NotificationType` union |
| `src/lib/email.ts` | MODIFY | Add hold lifecycle entries to `emailTypeToPreferenceKey` map |
| `src/lib/email-templates.ts` | MODIFY | Add `bookingHoldRequest`, `bookingExpired`, `bookingHoldExpired`, `bookingCancelled` HTML templates |

**Phase 0 verification:**
```bash
# 1. Edit schema.prisma FIRST (add version Int @default(1) to Listing)
# 2. Run cleanup migration
npx prisma db pull        # Must match schema.prisma exactly
npx prisma migrate dev    # Must produce no new migration
npx prisma generate       # Regenerate client
pnpm test                 # All existing tests pass
pnpm lint && pnpm typecheck  # Clean
```

### Phase 1: Multi-Slot Search Filter

**Flag:** No flag needed (additive read-only filter)

| File | Action | Changes |
|------|--------|---------|
| `src/lib/search-types.ts:57-80` | MODIFY | Add `minAvailableSlots?: number` to `FilterParams` interface |
| `src/lib/search-params.ts:20-40` | MODIFY | Add `minAvailableSlots?: number` to the second `FilterParams` interface. Parse `minSlots` URL param: validate `>= 1` and `<= 20`, coerce to integer |
| `src/lib/search-params.ts:~110` | MODIFY | Add `"minSlots"` to `FILTER_QUERY_KEYS` constant |
| `src/lib/search-params.ts` (`buildCanonicalFilterParamsFromSearchParams`) | MODIFY | Parse and serialize `minAvailableSlots` |
| `src/app/search/page.tsx:24-46` | MODIFY | Add `minSlots` to `SearchPageSearchParams` type |
| `src/lib/data.ts` | MODIFY | Lines ~327, ~600, ~843, ~1164: change `l."availableSlots" > 0` to `l."availableSlots" >= ${minSlots || 1}` |
| `src/lib/search/search-doc-queries.ts:430` | MODIFY | Change `d.available_slots > 0` to `d.available_slots >= ${minSlots || 1}` in `buildSearchDocWhereConditions()` |
| `src/app/api/search/facets/route.ts:172` | MODIFY | Change `d.available_slots > 0` to `d.available_slots >= ${minSlots || 1}` |
| `src/lib/search/natural-language-parser.ts` | MODIFY | Add patterns: `/\b([2-9]|[1-9]\d+)\s*(?:spots?|slots?|beds?|openings?)\b/i` -> `minAvailableSlots: N`. Use separate pattern for "rooms" to avoid collision with room-type parsing: `/\b(\d+)\s*(?:spots?|slots?|beds?|openings?)\b/i` (exclude "rooms?" from slot count — "rooms" already parsed as room type). Add to `ParsedNLQuery` interface and `STRIP_PATTERNS` |
| `src/hooks/useBatchedFilters.ts` | MODIFY | Add `minSlots: string` to `BatchedFilterValues` (line ~24-35). Add to `readFiltersFromURL()` parse logic and `commit()` URL serialization. **Add `"minSlots"` to `filterKeys` deletion list** (lines ~330-341) — if omitted, stale values will accumulate on navigation |
| `src/components/search/FilterModal.tsx` | MODIFY | Add number stepper between Room Type (lines ~236-264) and Amenities (lines ~266-298). Label: "Minimum open spots" (1-10). Wire to `onMinSlotsChange` prop. Type: pass as `number | undefined` to modal, convert to/from string at `BatchedFilterValues` boundary |
| `src/components/search/FilterModal.tsx` (props) | MODIFY | Add `minSlots?: number` and `onMinSlotsChange: (v: number \| undefined) => void` to `FilterModalProps` (lines ~23-85) |
| `src/components/SearchForm.tsx` | MODIFY | Wire `minSlots` through to FilterModal. Add to `baseFilterCount` calculation (lines ~511-519) |
| `src/lib/search/transform.ts:63-86` | MODIFY | Add `availableSlots` and `totalSlots` to `SearchV2ListItem` output for badge rendering |

### Phase 2: Multi-Slot Booking

**Flag:** `ENABLE_MULTI_SLOT_BOOKING`

| File | Action | Changes |
|------|--------|---------|
| `prisma/schema.prisma:180-201` | MODIFY | Add `slotsRequested Int @default(1)` to Booking model |
| `prisma/migrations/2026MMDD_add_slots_requested/migration.sql` | CREATE | `ALTER TABLE "Booking" ADD COLUMN "slotsRequested" INTEGER NOT NULL DEFAULT 1;` + `ALTER TABLE "Booking" ADD CONSTRAINT "booking_slots_requested_positive" CHECK ("slotsRequested" >= 1) NOT VALID;` + `ALTER TABLE "Booking" VALIDATE CONSTRAINT "booking_slots_requested_positive";` |
| `src/app/actions/booking.ts:~145-163` | MODIFY | Capacity check: change `COUNT(*)` of ACCEPTED bookings to `COALESCE(SUM("slotsRequested"), 0)` of ACCEPTED bookings with overlapping dates. Reject if `sum + new.slotsRequested > listing.totalSlots` |
| `src/app/actions/booking.ts:~200-209` | MODIFY | `createBooking` call: pass `slotsRequested` from form input. Feature-flag gated: if flag OFF, force `slotsRequested = 1`. Still creates as PENDING (Phase 2 doesn't change entry state) |
| `src/app/actions/manage-booking.ts:~148` | MODIFY | Accept: convert from Prisma `{ decrement: 1 }` to raw SQL with GREATEST floor: `SET "availableSlots" = GREATEST("availableSlots" - ${booking.slotsRequested}, 0) WHERE id = ${listingId} AND "availableSlots" >= ${booking.slotsRequested}`. If rowCount=0, abort |
| `src/app/actions/manage-booking.ts:~306-310` | MODIFY | Cancel of ACCEPTED: change `+ 1` to `+ booking.slotsRequested` in LEAST clamp raw SQL |
| `src/app/actions/manage-booking.ts:~109-126` | MODIFY | Accept capacity recheck: change `COUNT(*)` to `COALESCE(SUM("slotsRequested"), 0)` of overlapping ACCEPTED bookings (excluding current). **Also update the comparison expression** from `overlappingAcceptedCount + 1 > listing.totalSlots` to `sum + booking.slotsRequested > listing.totalSlots` |
| `src/components/BookingForm.tsx` | MODIFY | Add `SlotSelector` component. Hidden when `totalSlots === 1` or flag is OFF. Compute and display `totalRent = price * slotsRequested`. Add `slotsRequested` to `createBooking` call. On mobile, ensure touch targets are at least 44x44px |
| `src/components/SlotSelector.tsx` | CREATE | Reusable number stepper: `{ min: 1, max: availableSlots, value, onChange, disabled }`. Uses existing `Input` + `Label` + `Button` (variant `outline`) UI primitives. Accessible: `role="spinbutton"`, `aria-label`, `aria-valuemin/max/now`, keyboard support (up/down arrows) |

### Phase 3: Whole-Place Booking Mode

**Flag:** `ENABLE_WHOLE_UNIT_MODE`

> **DEPENDENCY:** Phase 3's overlap prevention trigger references the `HELD` status value. The Phase 4 enum migration (adding `HELD` to `BookingStatus`) must be applied BEFORE Phase 3's trigger. See Phase Dependencies below.

| File | Action | Changes |
|------|--------|---------|
| `prisma/schema.prisma` | MODIFY | Add `enum BookingMode { PER_SLOT WHOLE_UNIT }`. Add `bookingMode BookingMode @default(PER_SLOT)` and `holdTtlMinutes Int @default(1440)` to Listing model |
| `prisma/migrations/2026MMDD_add_booking_mode/migration.sql` | CREATE | Add columns + CHECK constraints: `holdTtlMinutes >= 15 AND holdTtlMinutes <= 4320`. Add `btree_gist` extension. Add overlap prevention trigger (see Section 7.1). Add `trg_enforce_whole_unit` trigger (BEFORE INSERT on Booking) per v2.1 Patch 5 |
| `src/app/api/listings/route.ts` (POST handler) | MODIFY | When `roomType === "Entire Place"`, auto-set `bookingMode = 'WHOLE_UNIT'`. Otherwise `PER_SLOT`. Feature-flag gated |
| `src/app/actions/booking.ts` | MODIFY | When `listing.bookingMode === 'WHOLE_UNIT'`, force `slotsRequested = listing.totalSlots`. Hide slot selector in UI via prop |
| `src/app/listings/create/CreateListingForm.tsx` | MODIFY | Add bookingMode selector when flag is ON. Auto-set based on `roomType` but allow override. Position near roomType select (lines ~817-828) |
| `src/app/listings/[id]/edit/EditListingForm.tsx` | MODIFY | Same bookingMode selector. Position near roomType select (lines ~718-731) |
| `listing_search_docs` (migration) | MODIFY | Add `booking_mode` column to search doc table |
| `src/lib/search/search-doc-sync.ts` | MODIFY | Add `booking_mode` to `fetchListingSearchData` SELECT (line ~72), INSERT column list/VALUES (line ~117-171), and ON CONFLICT DO UPDATE SET clause |

### Phase 4: Soft Holds with TTL

**Flag:** `ENABLE_SOFT_HOLDS`

> **THIS IS THE CORE BEHAVIORAL CHANGE**
>
> When this flag is ON, new bookings start as HELD (not PENDING), inventory is consumed at creation, and a TTL-based expiry system releases stale holds. This changes the marketplace dynamic from "host picks from applicants" to "first-come-first-served with host confirmation."

| File | Action | Changes |
|------|--------|---------|
| `prisma/schema.prisma` | MODIFY | Add `HELD` and `EXPIRED` to `BookingStatus` enum. Add `heldUntil DateTime?` and `heldAt DateTime?` to Booking model |
| `prisma/migrations/2026MMDD_add_soft_holds/migration.sql` | CREATE | Alter enum, add columns, add partial index: `CREATE INDEX idx_booking_held_expiry ON "Booking" ("heldUntil") WHERE "status" = 'HELD'` (NOT `heldUntil > NOW()` -- see Section 7.2) |
| `src/lib/booking-state-machine.ts` | MODIFY | Add `HELD` and `EXPIRED` states. New transitions: `HELD -> [ACCEPTED, REJECTED, CANCELLED, EXPIRED]`. `EXPIRED -> []` (terminal). `PENDING` transitions remain for legacy path |
| `src/app/actions/booking.ts` (core rewrite) | MODIFY | The 8-step createBooking flow from v2.1 Section 9 (see detailed breakdown below) |
| `src/app/actions/manage-booking.ts` (accept) | MODIFY | When flag ON: accept only checks `version` + `status === 'HELD'` (no listing row lock, no inventory change). Per v2.1 Patch 2 |
| `src/app/actions/manage-booking.ts` (cancel) | MODIFY | Add `heldUntil >= NOW()` guard **in the WHERE clause** of the updateMany/executeRaw (atomic with status transition, not a pre-check). If rowCount=0 and booking status is EXPIRED, return `already_expired`. Release inventory with LEAST clamp using `slotsRequested` |
| `src/app/actions/manage-booking.ts` (reject) | MODIFY | Same atomic `heldUntil` guard in WHERE clause. Release inventory with LEAST clamp using `slotsRequested` |
| `src/app/api/cron/expire-held-bookings/route.ts` | CREATE | Vercel Cron route (every 5 min). Pattern: `validateCronAuth` + batch processing. See Section 7.3 for sweeper details |
| `vercel.json` | MODIFY | Add cron schedules for `expire-held-bookings` (`*/5 * * * *`) and `reconcile-slots` (`0 3 * * 0`) |
| `src/components/HoldCountdown.tsx` | CREATE | Countdown timer. Props: `{ heldUntil: Date, serverTime: Date }`. Uses `useEffect` interval (1s ticks) with server time offset for clock-manipulation resistance. See Section 7.4. **Mobile:** position near booking CTA, not in sidebar footer |
| `src/lib/data.ts` (4 functions) | MODIFY | Ghost-hold LEFT JOIN per v2.1 Patch 1: compute `effective_available = availableSlots + COUNT(expired-but-not-yet-swept ghost holds)` at lines ~327, ~600, ~843, ~1164. See Section 1.6 for exact SQL |
| `src/lib/search/search-doc-queries.ts` | MODIFY | Same ghost-hold LEFT JOIN in `buildSearchDocWhereConditions` and SELECT clauses |
| `src/app/api/search/facets/route.ts:172` | MODIFY | Same ghost-hold treatment for `d.available_slots > 0` |
| `src/lib/search/search-doc-sync.ts` | MODIFY | Compute `effective_available` during sync using ghost-hold LEFT JOIN (see Section 1.6 for SQL). Update INSERT column list, VALUES, and ON CONFLICT DO UPDATE SET clause |

**createBooking 8-step flow (Phase 4, flag ON):**

```
Step 0: Rate limit check (BEFORE transaction — checkRateLimit uses its own DB ops)
Step 1: Auth + suspension + email verification checks (unchanged)
Step 2: Zod validation (add slotsRequested validation: >= 1, <= listing.availableSlots)
Step 3: Idempotency wrapper (unchanged pattern)
Step 4: Inside SERIALIZABLE transaction:
  4a. Opportunistic ghost-hold expiry (inline check-on-read)
      -- Expire HELD bookings with heldUntil < NOW() for this listing
      -- Increment availableSlots accordingly (LEAST clamp)
  4b. SELECT ... FOR UPDATE on Listing row
  4c. Anti-abuse checks:
      -- Max 3 active holds per user (COUNT WHERE tenantId=user AND status='HELD' AND heldUntil > NOW())
      -- Overlap check (same listing, overlapping dates, status IN ('HELD','ACCEPTED'))
  4d. Capacity guard: atomic decrement via raw SQL with GREATEST floor
      UPDATE "Listing"
      SET "availableSlots" = GREATEST("availableSlots" - ${slotsRequested}, 0)
      WHERE id = ${listingId}
        AND "availableSlots" >= ${slotsRequested}
      -- If rowCount = 0: no capacity, abort
  4e. Create booking with status = 'HELD', heldAt = NOW(), heldUntil = NOW() + holdTtlMinutes
Step 5: Side effects (OUTSIDE transaction): notifications (fire-and-forget)
```

### Phase 5: Audit Trail + Reconciliation

**Flag:** `ENABLE_BOOKING_AUDIT`

| File | Action | Changes |
|------|--------|---------|
| `prisma/schema.prisma` | MODIFY | Add `BookingAuditLog` model (separate from existing admin `AuditLog` at schema.prisma:420-436). Include `fromState` and `toState` fields. Add `ActorType` enum |
| Schema for BookingAuditLog | | See below |
| `src/app/actions/booking.ts` | MODIFY | Add audit log write inside every status-change transaction. Wrap in flag check |
| `src/app/actions/manage-booking.ts` | MODIFY | Add audit log write to accept, reject, cancel transactions |
| `src/app/api/cron/expire-held-bookings/route.ts` | MODIFY | Add audit log write with `actorType = 'SYSTEM'` for each expiry |
| `src/app/api/cron/reconcile-slots/route.ts` | CREATE | Weekly reconciliation cron (Sunday 3 AM). See Section 7.5 |
| `src/app/api/bookings/[id]/audit/route.ts` | CREATE | GET endpoint: returns ordered audit history for a booking. Read-only. Auth: owner or tenant only |

**BookingAuditLog schema (event sourcing lite):**

```prisma
model BookingAuditLog {
  id         String   @id @default(cuid())
  bookingId  String
  booking    Booking  @relation(fields: [bookingId], references: [id])
  action     String   // "CREATED", "HELD", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED", "SLOTS_RELEASED"
  fromState  String?  // Previous status (null for CREATED)
  toState    String   // New status
  actorType  String   // "USER", "HOST", "SYSTEM"
  actorId    String?  // User ID or "cron:expire-held-bookings"
  metadata   Json?    // Non-PII context: { slotsRequested, slotsReleased, heldUntil, reason }
  createdAt  DateTime @default(now())

  @@index([bookingId, createdAt])
  @@index([actorType, createdAt])
}
```

### Phase 6: UI Consistency

**Flag:** None (always on)

| File | Action | Changes |
|------|--------|---------|
| `src/components/ui/badge.tsx` | MODIFY | Add `success` and `info` variants to the Badge component's `cva` variants (currently only has `default`, `secondary`, `destructive`, `outline`). `success`: green bg/text. `info`: blue bg/text |
| `src/components/SlotBadge.tsx` | CREATE | Unified badge using extended `Badge` component. Logic: `0 available` = variant `destructive` "Filled"; `all available` = variant `success` "All N open"; else variant `info` "X of Y open" |
| `src/components/listings/ListingCard.tsx` | MODIFY | Extend local `Listing` interface (lines 13-28) to add `totalSlots: number`. Replace binary Available/Filled badge (lines 213-220) with `SlotBadge`. Render multi-room indicator when `totalSlots > 1` |
| `src/components/search/SearchResultsClient.tsx` | MODIFY | Pass `totalSlots` from `SearchV2ListItem` to `ListingCard` props in the mapping function |
| `src/app/listings/[id]/ListingPageClient.tsx:~301-303` | MODIFY | Replace raw `InfoStat` with `SlotBadge`. Add booking mode indicator when `bookingMode` is available |
| `src/lib/search/transform.ts:63-86` | MODIFY | Add `availableSlots`, `totalSlots`, `bookingMode` to `SearchV2ListItem`. Wire "multi-room" badge to use actual data |

**Mobile considerations for Phase 6:**
- `SlotBadge`: Ensure badge text is readable at mobile viewport. Use existing responsive patterns from `ListingCard`
- `SlotSelector` (from Phase 2): In mobile layout, `BookingForm` is not sticky — ensure stepper is visible near the booking CTA, not buried below content
- `HoldCountdown` (from Phase 4): Position near the booking CTA on mobile, not at the bottom of the non-sticky sidebar

---

## 3. Existing Data Migration Strategy

When `ENABLE_SOFT_HOLDS` goes live, new bookings start as HELD. But existing bookings are PENDING or ACCEPTED. How do we handle the transition?

### 3.1 Decision: Keep PENDING as Legacy State

Do NOT convert existing PENDING bookings to HELD. They were created under a different marketplace model (host picks from applicants). Converting them would require fabricating `heldUntil` timestamps and could unexpectedly expire bookings that hosts haven't reviewed yet.

### 3.2 Dual-Path Logic

The state machine supports both paths based on the feature flag:

| Scenario | Flag OFF (current) | Flag ON (new) |
|----------|-------------------|---------------|
| `createBooking` entry state | PENDING | HELD |
| Accept path | Decrements inventory (GREATEST floor) | No inventory change (already held) |
| Cancel of entry state | No inventory effect (PENDING) | Releases inventory with LEAST clamp + atomic heldUntil guard (HELD) |
| Cancel of ACCEPTED | Releases inventory (LEAST clamp) | Same behavior |
| Cron sweeper | Not running | Every 5 min, expires stale HELD bookings |

Legacy PENDING bookings: Can still be accepted (with inventory decrement) or rejected (no inventory change) regardless of flag state. The accept path checks the booking's actual status, not the flag.

### 3.3 When to Remove the Dual Path

After all existing PENDING bookings have been resolved (accepted, rejected, or cancelled), the PENDING entry state code path can be deleted. Track with:

```sql
SELECT COUNT(*) FROM "Booking" WHERE status = 'PENDING';
```

When it reaches 0, remove the legacy path and the feature flag. This is the **expand and contract** migration pattern recommended by Prisma for zero-downtime production changes.

### 3.4 Phase 4 Rollback Runbook

> **CRITICAL: Disabling `ENABLE_SOFT_HOLDS` after production deployment requires careful sequencing**

Turning the flag OFF while HELD bookings exist will break the accept path: the flag-OFF branch expects PENDING status and tries to decrement inventory that was already consumed at hold creation.

**Rollback procedure:**

1. **Check active holds:**
   ```sql
   SELECT COUNT(*) FROM "Booking" WHERE status = 'HELD' AND "heldUntil" > NOW();
   ```

2. **If count > 0: drain before disabling.**
   - Keep the `expire-held-bookings` cron running
   - Wait until all HELD bookings either expire naturally or are accepted/rejected by hosts
   - Re-check count periodically

3. **Emergency rollback** (if you can't wait for drain):
   ```sql
   -- Force-expire all active holds and release inventory
   WITH expired_holds AS (
     UPDATE "Booking"
     SET status = 'EXPIRED', "updatedAt" = NOW(), version = version + 1
     WHERE status = 'HELD'
     RETURNING "listingId", "slotsRequested"
   )
   UPDATE "Listing" l
   SET "availableSlots" = LEAST(
     l."availableSlots" + COALESCE(eh.total_released, 0),
     l."totalSlots"
   )
   FROM (
     SELECT "listingId", SUM("slotsRequested") AS total_released
     FROM expired_holds GROUP BY "listingId"
   ) eh
   WHERE l.id = eh."listingId";
   ```

4. **After drain/emergency:** Disable the flag. Run reconciliation to verify inventory accuracy.

---

## 4. Test File Mapping

Mapped to your existing test infrastructure (Jest + Playwright).

### 4.1 Pre-Existing Test Gaps to Fix First

These gaps exist TODAY and should be fixed in Phase 0 to establish a solid baseline:

| Test Gap | File to Create/Modify | Coverage |
|----------|----------------------|----------|
| Missing cron test | `src/__tests__/api/cron/cleanup-idempotency-keys.test.ts` (CREATE) | Auth, defense-in-depth, success case, DB error |
| Version conflict untested | `src/__tests__/actions/manage-booking.test.ts` (MODIFY) | `updateMany` returning `count: 0` should return `CONCURRENT_MODIFICATION` |
| Email verification rejection | `src/__tests__/actions/booking.test.ts` (MODIFY) | `emailVerified: null` should be rejected by `createBooking` |
| Block check rejection | `src/__tests__/actions/booking.test.ts` (MODIFY) | `checkBlockBeforeAction` returning `{ allowed: false }` path |
| Invalid state transition integration | `src/__tests__/actions/manage-booking.test.ts` (MODIFY) | When `validateTransition` throws `InvalidStateTransitionError`, correct error returned to caller |
| LEAST clamp upper bound | `src/__tests__/actions/manage-booking.test.ts` (MODIFY) | Cancel-of-ACCEPTED raw SQL asserting that LEAST prevents `availableSlots > totalSlots` |
| Past-date test data | `src/__tests__/actions/manage-booking.test.ts` (MODIFY) | Update mockBooking dates to future dates (currently uses 2025 dates which are in the past) |

### 4.2 Existing Tests to Modify for New Features

| Test File | Changes Required |
|-----------|-----------------|
| `src/__tests__/actions/booking.test.ts` | Add `slotsRequested` parameter to `createBooking` calls. Add capacity check tests for multi-slot (SUM vs COUNT). Add HELD state creation tests (flag ON path). Add rate limit test |
| `src/__tests__/actions/manage-booking.test.ts` | Update accept/cancel tests for `slotsRequested > 1`. Add `heldUntil` guard tests (expired hold rejection). Add HELD state accept tests (no inventory change). Test cancel of HELD releases inventory. Test GREATEST floor on accept decrement |
| `src/__tests__/lib/booking-state-machine.test.ts` | Add HELD and EXPIRED states. Test all new transitions (`HELD -> ACCEPTED/REJECTED/CANCELLED/EXPIRED`). Test `EXPIRED` is terminal. Test `isTerminalStatus('EXPIRED') === true` |
| `tests/e2e/booking/booking-race-conditions.spec.ts` | Add RC-10: concurrent hold + cron expire. RC-11: multi-slot last-slot race (2 users requesting remaining slots simultaneously). RC-12: cancel of expired hold returns `already_expired`. RC-13: same user, two concurrent requests to different listings (3-hold limit bypass test) |

### 4.3 New Test Files to Create

| New Test File | Coverage |
|--------------|----------|
| `src/__tests__/booking/multi-slot.test.ts` | `slotsRequested` validation (>= 1, rejects 0 and 999), capacity SUM logic, multi-slot accept/cancel, `totalRent` computation, feature flag gating, GREATEST floor on decrement |
| `src/__tests__/booking/soft-holds.test.ts` | HELD creation, `heldUntil` atomic guard (in WHERE clause), ghost-hold opportunistic expiry, anti-abuse limits (**exact boundary: 3 allowed, 4th rejected**), overlap check, rate limit, duplicate overlap rejection, idempotency key reuse in HELD state |
| `src/__tests__/booking/whole-unit.test.ts` | Auto `slotsRequested = totalSlots` when WHOLE_UNIT, trigger enforcement, bookingMode filter, roomType auto-set, `holdTtlMinutes` validation (rejects 0, 9999) |
| `src/__tests__/booking/audit-log.test.ts` | Audit write in same transaction (atomicity), all state transitions logged, `fromState`/`toState` correctness, SYSTEM actor for cron expiry, metadata content |
| `src/__tests__/booking/flag-rollback.test.ts` | Flag-OFF with existing HELD bookings (accept path uses correct branch), PENDING bookings still work with flag ON |
| `src/__tests__/cron/expire-held-bookings.test.ts` | Auth (matching existing cron test pattern), sweeper finds expired holds, releases slots with LEAST clamp, bumps booking version, writes audit log, idempotent on re-run, batch size limit, SKIP LOCKED behavior, notifications sent OUTSIDE transaction |
| `src/__tests__/cron/reconcile-slots.test.ts` | Expected vs actual calculation, drift detection, drift correction (positive AND negative), zero-drift case, advisory lock prevents concurrent runs, NULL heldUntil handling for ACCEPTED bookings |
| `src/__tests__/booking/notification-types.test.ts` | All hold lifecycle notification types fire with correct recipient, content, and email preference gating |
| `tests/e2e/booking/multi-slot-booking.spec.ts` | Full flow: search with minSlots filter -> book 2 slots -> see totalRent displayed -> host accepts -> verify availableSlots decremented by 2 |
| `tests/e2e/booking/hold-countdown.spec.ts` | Hold created -> countdown visible -> host accepts -> countdown disappears -> booking shows ACCEPTED |

### 4.4 E2E Seed Data Additions

The current `scripts/seed-e2e.js` does not create listings suitable for multi-slot or hold countdown tests. Add:

```javascript
// In seed-e2e.js, add to the listings array:
{
  // Multi-slot test listing (owned by reviewer user)
  title: "3-Bed Shared Room for E2E",
  totalSlots: 3,
  availableSlots: 3,
  // ... other required fields matching existing seed pattern
},
{
  // Short-TTL listing for countdown tests (owned by reviewer user)
  title: "Quick-Hold Test Listing",
  totalSlots: 1,
  availableSlots: 1,
  holdTtlMinutes: 2,  // 2-minute hold for testable countdown
  // ... other required fields
},
```

**E2E environment:** Ensure `CRON_SECRET` is set in `.env.test` / `.env.local` so RC-10 tests can call the cron endpoint directly.

---

## 5. Phased Rollout Timeline

| Phase | Duration | Flag | Risk | Ship Criteria |
|-------|----------|------|------|---------------|
| 0: Cleanup | 3-4 days | None | Medium | `prisma db pull` matches `schema.prisma`. All tests pass. EditListingForm bug fixed. Pre-existing test gaps filled. Feature flags added with cross-validation. Rate limit added to createBooking. Notification types extended |
| 1: Search | 2-3 days | None | Low | Search with `minSlots` returns correct results across V1 and V2 paths. NLP parser extracts slot counts. Facets route updated. FILTER_QUERY_KEYS includes minSlots. E2E passes |
| 2: Multi-Slot | 4-5 days | `ENABLE_MULTI_SLOT_BOOKING` | Medium | Concurrent booking tests pass. Accept/cancel correctly use `slotsRequested`. SUM-based capacity check verified. GREATEST floor clamp on all decrements |
| 3: Whole-Unit | 3-4 days | `ENABLE_WHOLE_UNIT_MODE` | Medium | Overlap trigger prevents double bookings for WHOLE_UNIT listings. Trigger enforces invariant. Auto-set works for Entire Place. bookingMode synced to search docs |
| 4: Soft Holds | **8-10 days** | `ENABLE_SOFT_HOLDS` | **HIGH** | All RC tests pass (including RC-13 hold-limit bypass). Sweeper runs with SKIP LOCKED + version bump. Ghost-hold queries work in data.ts + search-doc-sync + facets. Anti-abuse blocks griefing. Countdown syncs with server time. Check-on-read inline expiry works. Atomic heldUntil guards on cancel/reject. Rollback runbook documented |
| 5: Audit | 2-3 days | `ENABLE_BOOKING_AUDIT` | Low | Every state change has audit entry with `fromState`/`toState`. Reconciliation finds zero drift (positive AND negative). Transaction-level advisory lock prevents concurrent reconciliation. No PII in logs |
| 6: UI Polish | 3-4 days | None | Low | Badge variants extended. SlotBadge consistent across ListingCard, ListingPageClient, search results. SearchResultsClient passes totalSlots. Mobile layout verified for SlotSelector and HoldCountdown |
| **TOTAL** | **25-33 days** | | | **6-8 weeks for a solo engineer** |

### Simplified Option (4 Weeks)

If 6-8 weeks is too long: implement Phases 0-2 + Phase 4 only. Skip WHOLE_UNIT mode (Phase 3), skip audit trail (Phase 5), skip UI polish (Phase 6). Run the Vercel Cron sweeper every 60 seconds instead of adding ghost-hold queries to search. This gets you multi-slot booking + soft holds in ~4 weeks.

**Risks of simplified option:**
- No EXCLUSION/trigger for WHOLE_UNIT overlap prevention (app-level check only)
- No reconciliation cron (no automated drift correction)
- Listings with expired holds show incorrect availability for up to 60s in search
- SlotBadge shows binary Available/Filled instead of "X of Y open"

### Phase Dependencies

```
Phase 0 (cleanup) ──> Phase 1 (search) ──> Phase 2 (multi-slot)
                                                │
                                                ├──> Phase 4 (soft holds) ──> Phase 3 (whole-unit)*
                                                │                              │
                                                │                              └──> Phase 5 (audit)
                                                │
                                                └──> Phase 6 (UI polish, can start after Phase 2)

* Phase 3's overlap trigger references HELD status, so Phase 4's enum migration must come first.
  Phase 3's non-trigger work (bookingMode column, listing form UI) can start in parallel.
```

---

## 6. Pre-Implementation Checklist

Before writing any feature code, complete these items **in order**:

1. **DECIDE:** Do you want the HELD model (first-come-first-served) or keep PENDING (host picks from applicants)? This is a **product decision** that affects everything. If HELD: implement all 6 phases. If PENDING: implement only Phases 0-2 + 6.

2. **EDIT** `prisma/schema.prisma` to add `version Int @default(1)` to the Listing model (column already exists in DB — this is a schema sync).

3. **RUN** the Phase 0 cleanup migration. Drop all Phase 1 drift + NeighborhoodCache + User.subscriptionTier + orphaned indexes. Add `listing_available_slots_non_negative` CHECK constraint. Verify `prisma db pull` matches `schema.prisma` exactly.

4. **FIX** the EditListingForm.tsx totalSlots field (missing `min="1" max="20" step="1"` attributes). This is a pre-existing bug.

5. **ADD** the 4 feature flag env vars to `src/lib/env.ts` using `z.enum(["true", "false"]).optional()`. Add runtime getters. Add `superRefine` cross-flag validation. Add them to `.env.local` with all set to `"false"`.

6. **ADD** rate limiting to `createBooking` (before Zod parse). Add `createBooking` entry to `RATE_LIMITS` in `rate-limit.ts`.

7. **EXTEND** notification types: add `BOOKING_HOLD_REQUEST`, `BOOKING_EXPIRED`, `BOOKING_HOLD_EXPIRED` to `NotificationType` union in `notifications.ts`, preference map in `email.ts`, and templates in `email-templates.ts`.

8. **FIX** the missing `bookingCancelled` email template (currently only in-app notification on cancel).

9. **FIX** the pre-existing test gaps (cleanup-idempotency-keys test, version conflict path, email verification rejection, block check rejection, LEAST clamp upper bound assertion).

10. **RUN** the full existing test suite (Jest + Playwright) and confirm everything is green. This is your baseline.

11. **THEN** start Phase 1 (search filter). It's the lowest-risk, highest-confidence-building change.

---

## 7. Industry Best Practices Applied

These patterns were identified through research of how Airbnb, Stripe, Ticketmaster, and production PostgreSQL booking systems handle similar challenges.

### 7.1 Overlap Prevention for Whole-Unit Bookings (Trigger-Based)

> **IMPORTANT: Do NOT use a blanket EXCLUSION constraint.** An EXCLUSION constraint on `(listingId, daterange)` would block ALL overlapping bookings for ANY listing — including multi-slot shared houses where overlapping dates are expected. EXCLUSION constraint partial predicates cannot reference other tables (`bookingMode` is on `Listing`, not `Booking`).

**Correct approach: trigger-based enforcement scoped to WHOLE_UNIT mode.**

```sql
-- Requires btree_gist extension (for daterange overlap operator)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Trigger function: only enforces for WHOLE_UNIT listings
CREATE OR REPLACE FUNCTION check_whole_unit_overlap()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enforce for WHOLE_UNIT listings
  IF (SELECT "bookingMode" FROM "Listing" WHERE id = NEW."listingId") = 'WHOLE_UNIT' THEN
    IF EXISTS (
      SELECT 1 FROM "Booking"
      WHERE "listingId" = NEW."listingId"
        AND id != COALESCE(NEW.id, '')
        AND status IN ('HELD', 'ACCEPTED')
        AND daterange("startDate"::date, "endDate"::date, '[)') &&
            daterange(NEW."startDate"::date, NEW."endDate"::date, '[)')
    ) THEN
      RAISE EXCEPTION 'Overlapping active booking exists for whole-unit listing %', NEW."listingId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_whole_unit_overlap
  BEFORE INSERT OR UPDATE OF status ON "Booking"
  FOR EACH ROW
  WHEN (NEW.status IN ('HELD', 'ACCEPTED'))
  EXECUTE FUNCTION check_whole_unit_overlap();
```

For **multi-slot (PER_SLOT)** listings, overlap prevention remains application-level: `COALESCE(SUM("slotsRequested"), 0)` of overlapping active bookings must be `<= totalSlots`. The trigger does not fire for PER_SLOT listings.

### 7.2 Partial Index for Hold Expiry (Correct Specification)

**Important:** `NOW()` in a partial index predicate is evaluated at **index creation time**, not query time. This makes `WHERE status = 'HELD' AND heldUntil > NOW()` useless as a partial index.

**Correct pattern:**

```sql
-- Index only HELD bookings (small subset of all bookings)
CREATE INDEX idx_booking_held_expiry
ON "Booking" ("heldUntil")
WHERE status = 'HELD';
```

The sweeper query adds the time filter at query time:

```sql
SELECT id, "listingId", "slotsRequested"
FROM "Booking"
WHERE status = 'HELD' AND "heldUntil" < NOW()
LIMIT 50
FOR UPDATE SKIP LOCKED;
```

### 7.3 Sweeper with FOR UPDATE SKIP LOCKED

**Industry pattern: Ticketmaster/Stripe use batch sweepers that can run concurrently without contention.**

```typescript
// src/app/api/cron/expire-held-bookings/route.ts
export async function GET(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const BATCH_SIZE = 50; // Completes within Vercel timeout budget

  // Collect expired hold data inside transaction
  const expiredHolds = await prisma.$transaction(async (tx) => {
    // SKIP LOCKED: if another sweeper instance is running, skip those rows
    const holds = await tx.$queryRaw<Array<{id: string, listingId: string, slotsRequested: number, tenantId: string}>>`
      SELECT id, "listingId", "slotsRequested", "tenantId"
      FROM "Booking"
      WHERE status = 'HELD' AND "heldUntil" < NOW()
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (holds.length === 0) return [];

    for (const hold of holds) {
      // Transition to EXPIRED + bump version for optimistic lock safety
      await tx.$executeRaw`
        UPDATE "Booking"
        SET status = 'EXPIRED', "updatedAt" = NOW(), version = version + 1
        WHERE id = ${hold.id} AND status = 'HELD'
      `;

      // Release inventory with LEAST clamp
      await tx.$executeRaw`
        UPDATE "Listing"
        SET "availableSlots" = LEAST("availableSlots" + ${hold.slotsRequested}, "totalSlots")
        WHERE id = ${hold.listingId}
      `;

      // Audit log (if ENABLE_BOOKING_AUDIT) — inside transaction for atomicity
      if (features.bookingAudit) {
        await tx.bookingAuditLog.create({
          data: {
            bookingId: hold.id,
            action: 'EXPIRED',
            fromState: 'HELD',
            toState: 'EXPIRED',
            actorType: 'SYSTEM',
            actorId: 'cron:expire-held-bookings',
            metadata: { slotsReleased: hold.slotsRequested },
          },
        });
      }
    }

    return holds;
  }, { timeout: 8000 }); // Stay within Vercel timeout

  // Send notifications OUTSIDE transaction (fire-and-forget)
  for (const hold of expiredHolds) {
    // Notify tenant and host about hold expiry
    // Use createInternalNotification + sendNotificationEmailWithPreference
    // Errors are logged and swallowed (circuit breaker protects email service)
  }

  return Response.json({
    success: true,
    expired: expiredHolds.length,
    timestamp: new Date().toISOString(),
  });
}
```

### 7.4 Server-Synced Countdown Timer

**Defense against client clock manipulation (Airbnb pattern):**

```typescript
// src/components/HoldCountdown.tsx
interface HoldCountdownProps {
  heldUntil: Date;    // Absolute UTC timestamp from server
  serverTime: Date;   // Server's current time at data fetch
  onExpired?: () => void;
}

export function HoldCountdown({ heldUntil, serverTime, onExpired }: HoldCountdownProps) {
  // Compute offset between server and client clocks (once, on mount)
  const offsetRef = useRef(serverTime.getTime() - Date.now());
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, heldUntil.getTime() - (Date.now() + offsetRef.current))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const correctedNow = Date.now() + offsetRef.current;
      const left = Math.max(0, heldUntil.getTime() - correctedNow);
      setRemaining(left);
      if (left === 0) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [heldUntil, onExpired]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  if (remaining === 0) return <Badge variant="destructive">Hold expired</Badge>;

  return (
    <Badge variant="destructive">
      Hold expires in {minutes}:{seconds.toString().padStart(2, '0')}
    </Badge>
  );
}
```

The server is always the source of truth for expiration. The countdown is purely visual. When the user attempts accept/extend, the server re-validates `heldUntil > NOW()` regardless of what the client shows.

### 7.5 Reconciliation Cron with Transaction-Level Advisory Lock

**Prevents inventory drift from accumulating (used by Airbnb, Ticketmaster):**

> **IMPORTANT:** Use `pg_advisory_xact_lock` (transaction-level), NOT `pg_try_advisory_lock` (session-level). Session-level locks are tied to database connections, and Prisma's connection pool may return a connection between lock/unlock calls, leaving the lock held indefinitely.

```typescript
// src/app/api/cron/reconcile-slots/route.ts
export async function GET(request: Request) {
  const authError = validateCronAuth(request);
  if (authError) return authError;

  const result = await prisma.$transaction(async (tx) => {
    // Transaction-level advisory lock — automatically released on commit/rollback
    // Use hashtext to avoid namespace collision with arbitrary lock ID
    const [{ acquired }] = await tx.$queryRaw<[{acquired: boolean}]>`
      SELECT pg_try_advisory_xact_lock(hashtext('reconcile-slots')) as acquired
    `;

    if (!acquired) {
      return { skipped: true, driftedListings: 0 };
    }

    // For each listing, compute expected availableSlots from source of truth
    // Handle NULL heldUntil for ACCEPTED bookings (no TTL)
    const drifted = await tx.$queryRaw<Array<{id: string, actual: number, expected: number}>>`
      SELECT
        l.id,
        l."availableSlots" as actual,
        l."totalSlots" - COALESCE(
          (SELECT SUM(b."slotsRequested")
           FROM "Booking" b
           WHERE b."listingId" = l.id
             AND b.status IN ('HELD', 'ACCEPTED')
             AND (b.status != 'HELD' OR b."heldUntil" > NOW())
          ), 0
        )::int as expected
      FROM "Listing" l
      WHERE l.status = 'ACTIVE'
        AND l."availableSlots" != (
          l."totalSlots" - COALESCE(
            (SELECT SUM(b."slotsRequested")
             FROM "Booking" b
             WHERE b."listingId" = l.id
               AND b.status IN ('HELD', 'ACCEPTED')
               AND (b.status != 'HELD' OR b."heldUntil" > NOW())
            ), 0
          )
        )
    `;

    for (const listing of drifted) {
      await tx.$executeRaw`
        UPDATE "Listing" SET "availableSlots" = ${listing.expected}
        WHERE id = ${listing.id}
      `;
      // Structured logging — no raw IDs per CLAUDE.md non-negotiables
      logger.sync.warn('[reconcile] inventory drift detected', {
        driftAmount: listing.actual - listing.expected,
        direction: listing.actual > listing.expected ? 'over-counted' : 'under-counted',
      });
    }

    return { skipped: false, driftedListings: drifted.length };
  }); // Lock auto-released on commit

  if (result.skipped) {
    return Response.json({ success: true, skipped: 'concurrent run', timestamp: new Date().toISOString() });
  }

  return Response.json({
    success: true,
    driftedListings: result.driftedListings,
    timestamp: new Date().toISOString(),
  });
}
```

### 7.6 Check-on-Read Inline Expiration

**Supplement cron sweeper with inline expiry checks (Airbnb pattern):**

When a listing is fetched for booking or display, check if any HELD bookings have expired and expire them inline. This reduces the window between cron runs:

```typescript
// Called at the start of executeBookingTransaction, before capacity check
async function expireGhostHoldsForListing(tx: PrismaTransaction, listingId: string) {
  const expired = await tx.$queryRaw<Array<{id: string, slotsRequested: number}>>`
    UPDATE "Booking"
    SET status = 'EXPIRED', "updatedAt" = NOW(), version = version + 1
    WHERE "listingId" = ${listingId}
      AND status = 'HELD'
      AND "heldUntil" < NOW()
    RETURNING id, "slotsRequested"
  `;

  if (expired.length > 0) {
    const totalReleased = expired.reduce((sum, h) => sum + h.slotsRequested, 0);
    await tx.$executeRaw`
      UPDATE "Listing"
      SET "availableSlots" = LEAST("availableSlots" + ${totalReleased}, "totalSlots")
      WHERE id = ${listingId}
    `;
  }

  return expired.length;
}
```

### 7.7 Prisma TypedSQL (Nice-to-Have)

Prisma 6 introduced TypedSQL (GA) for type-safe raw queries. Instead of `$queryRaw<ManualType>`, you can write SQL files in `prisma/sql/` and get generated TypeScript types. Consider adopting for the most critical queries:

```
prisma/sql/expireHeldBookings.sql
prisma/sql/decrementSlots.sql
prisma/sql/reconcileSlots.sql
```

This eliminates the risk of type mismatches in raw SQL return values. Not blocking for launch but recommended for Phase 4+ queries.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase 0 migration drops data that's actually needed | Low | High | Verify all Phase 1 columns have no production data before dropping. Run `SELECT COUNT(*) FROM "SleepingSpot"` and `SELECT COUNT(*) FROM "SpotWaitlist"` first |
| Sweeper misses expired holds (Vercel cron flakiness) | Medium | Medium | Ghost-hold LEFT JOIN queries in search + check-on-read inline expiry provide defense-in-depth. Monitor cron execution via Sentry |
| Race condition: two users get the last slot | Low | High | SERIALIZABLE transaction + FOR UPDATE lock + CHECK constraint `availableSlots >= 0` + GREATEST floor clamp provides quadruple protection |
| availableSlots goes negative | Low | High | DB CHECK constraint `availableSlots >= 0` prevents it at database level. GREATEST floor clamp on all decrements prevents it at application level |
| availableSlots drifts from true count | Medium | Medium | Weekly reconciliation cron auto-corrects (positive AND negative drift). Structured logging alerts on drift > 0 |
| Client clock manipulation extends countdown | Low | Low | Server is source of truth. Accept/cancel always re-validates `heldUntil > NOW()` server-side atomically in WHERE clause. Countdown is purely cosmetic |
| Feature flag misconfiguration | Low | High | Zod validation with `superRefine` cross-validation at startup catches invalid combinations. All flags default to `"false"` (safe default). Server fails fast with clear error |
| Feature flag rollback with existing HELD bookings | Medium | High | Rollback runbook in Section 3.4. Drain procedure + emergency SQL. Keep sweeper running until HELD count = 0 |
| Overlap trigger blocks valid multi-slot bookings | None | None | Trigger only fires for WHOLE_UNIT listings (checks `bookingMode`). PER_SLOT listings use application-level SUM check |
| Notification failure blocks booking | Low | Medium | Already mitigated: side effects fire outside transactions. Circuit breaker on email. Failures logged and swallowed |
| Sweeper and cancel race: double slot release | Low | Medium | Sweeper uses FOR UPDATE row lock. Cancel uses atomic `heldUntil >= NOW()` WHERE clause + optimistic lock. Sweeper bumps version. LEAST clamp prevents above-totalSlots |
| Advisory lock held indefinitely by connection pool | None | None | Mitigated: using `pg_advisory_xact_lock` (transaction-level, auto-released on commit/rollback) |
| Dual-path (PENDING/HELD) logic drift | Medium | Medium | Clear documentation. Feature flag makes paths explicit. `superRefine` validates combinations. Monitor `COUNT(*) FROM Booking WHERE status = 'PENDING'` to know when to remove legacy path |
| Same user bypasses 3-hold limit via concurrent requests | Low | Low | SERIALIZABLE anti-phantom guarantees detect this. Add explicit test case (RC-13) |
| PII in cron/audit logs | Low | High | Structured logger (not console.warn). No raw IDs in log messages. Audit metadata uses non-PII context only |

---

## 9. Feature Flag Safety Matrix

| MULTI_SLOT | WHOLE_UNIT | SOFT_HOLDS | AUDIT | Safe? | Notes |
|------------|------------|------------|-------|-------|-------|
| false | false | false | false | **Safe** | Current baseline |
| true | false | false | false | **Safe** | Phase 2 only — slot selector, SUM capacity |
| true | true | false | false | **Safe** | Phase 2+3 — overlap trigger dormant (no HELD bookings) |
| true | false | true | false | **Safe** | Simplified option (Phases 0-2+4) |
| true | true | true | false | **Safe** | Full system minus audit |
| true | true | true | true | **Safe** | Full system — intended final state |
| false | true | * | * | **BLOCKED** | Zod superRefine rejects: WHOLE_UNIT requires MULTI_SLOT |
| * | * | false | true | **BLOCKED** | Zod superRefine rejects: AUDIT requires SOFT_HOLDS |
| false | false | true | false | **RISKY** | Capacity uses COUNT not SUM — safe only because slotsRequested forced to 1. Allowed but not recommended |

> All **BLOCKED** combinations cause the server to fail at startup with a descriptive Zod error. No silent misbehavior.

---

## Bottom Line

You have a production-grade booking system with strong concurrency foundations (SERIALIZABLE transactions, FOR UPDATE locks, optimistic locking, idempotency, raw SQL LEAST clamps). The v2.1 plan's architecture is correct.

This document maps every theoretical design to your **actual** files, functions, and patterns -- with corrected file paths, complete drift inventory (including orphaned indexes), industry best practices (trigger-based overlap prevention, SKIP LOCKED sweepers with version bumps, server-synced countdowns, check-on-read expiry, GREATEST floor clamps), pre-existing gaps that should be fixed first, and a comprehensive rollback runbook.

The main risk is the behavioral shift from PENDING to HELD -- that's a **product decision**, not a technical one. Once you make that call, the implementation path is clear.

**Sources consulted:**
- Airbnb system design (reservation pattern, inventory management)
- Ticketmaster system design (TTL-based holds, Redis distributed locks)
- Stripe payment holds (authorization pattern)
- PostgreSQL official docs (EXCLUSION constraints, partial indexes, advisory locks, FOR UPDATE SKIP LOCKED)
- Prisma 6 docs (TypedSQL, interactive transactions, expand-and-contract migrations)
- Vercel Cron docs (timeout limits, security, batch processing)
- React 19 docs (useOptimistic, useEffect cleanup patterns)
- Dan Abramov's declarative setInterval pattern
- OWASP rate limiting best practices

**Review history:**
- v2.0: Initial codebase-tailored implementation guide
- v3.0: 4-agent parallel code review (Architecture/DB 8/10, Security/Races 6.5/10, Testing/Rollout 7/10, UI-UX/Integration 6.5/10 → composite 7.0/10). 25 fixes integrated: EXCLUSION→trigger, GREATEST floor clamps, z.enum flag pattern, cross-flag superRefine, rate limiting, NotificationType union, rollback runbook, transaction-level advisory lock, sweeper version bump, atomic heldUntil guards, facets route, SearchResultsClient, ghost-hold SQL, FILTER_QUERY_KEYS, orphaned indexes, PII logging, Badge variants, NLP ambiguity, E2E seed data, timeline revision, 8 additional test scenarios, mobile layout notes, corrected phase dependencies
