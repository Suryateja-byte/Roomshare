# Implementation Guide Review — 4-Agent Parallel Code Review

**Document reviewed:** `docs/plans/roomshare-tailored-implementation-guide.md`
**Review date:** 2026-03-09
**Method:** 4 specialized reviewer agents in parallel + sequential thinking synthesis
**Agents:** Architecture/DB, Security/Races, Testing/Rollout, UI-UX/Integration

> **Note:** The original implementation guide (`roomshare-tailored-implementation-guide.md`) is not committed to this repository. This review is a standalone, self-contained document — all referenced code, SQL, and design decisions are reproduced here with full context. An engineer can implement directly from this review without needing the source document.

---

## Composite Rating: 7.0 / 10

| Dimension | Rating | Reviewer |
|-----------|--------|----------|
| Architecture & Database | 8/10 | Agent 1 |
| Security & Race Conditions | 6.5/10 | Agent 2 |
| Testing & Rollout Strategy | 7/10 | Agent 3 |
| UI/UX & Integration | 6.5/10 | Agent 4 |
| **Composite** | **7.0/10** | Weighted average |

**Verdict:** Strong architectural document that correctly maps v2.1 theory to actual codebase files. Industry references are well-applied. Weaknesses are concentrated in: (1) concurrency edge cases during PENDING/HELD dual-path period, (2) missing implementation details for non-trivial changes, (3) feature flag interaction safety and rollback planning.

---

## What the Plan Gets Right (consensus across all 4 agents)

- SERIALIZABLE + FOR UPDATE combination is correct and matches actual codebase patterns
- LEAST clamp on slot increments correctly propagated to multi-slot
- FOR UPDATE SKIP LOCKED sweeper is the right pattern for Vercel's multi-instance environment
- Partial index on `heldUntil WHERE status='HELD'` correctly avoids the `NOW()` evaluation-time trap
- Server-synced countdown with clock-offset is correct UX pattern
- Check-on-read inline expiry is good defense-in-depth
- `cron-auth.ts` timing-safe comparison is production-grade
- Pre-existing test gap identification (5 items) verified as real
- Phase 0 drift inventory is mostly complete
- Correctly identifies that listing creation lives in API route, not server action
- The PENDING vs HELD behavioral analysis is insightful product thinking
- Dual-path (expand-and-contract) migration strategy is well-reasoned

---

## All Issues Found (24 active + 1 retracted, priority-ordered)

### MUST-FIX BEFORE IMPLEMENTATION (8 issues — will cause failures)

#### C1. EXCLUSION Constraint Blocks Multi-Slot Bookings
**Found by:** Arch (100%), Security (92%), Testing (95%) — **unanimous**

The constraint as written fires for ALL listings, not just WHOLE_UNIT:
```sql
EXCLUDE USING GIST ("listingId" WITH =, daterange(...) WITH &&)
WHERE (status IN ('HELD', 'ACCEPTED'));
```
A 3-bedroom shared house could never have two tenants with overlapping dates — destroying the multi-slot model. The plan acknowledges this in the risk register but the implementation SQL doesn't fix it.

**Fix:** Either scope to WHOLE_UNIT via a trigger (EXCLUSION partial predicates can't reference other tables), or defer entirely to Phase 3 and implement as a conditional BEFORE INSERT OR UPDATE trigger with `FOR UPDATE` locking on the parent row:
```sql
CREATE OR REPLACE FUNCTION check_whole_unit_overlap() RETURNS TRIGGER AS $$
BEGIN
  -- Lock the parent listing row to serialize concurrent booking attempts.
  -- This makes the trigger race-safe under READ COMMITTED (no SERIALIZABLE required).
  -- See: PostgreSQL Wiki "How to avoid overlapping intervals" and Vlad Mihalcea's advisory lock patterns.
  PERFORM 1 FROM "Listing" WHERE id = NEW."listingId" FOR UPDATE;

  IF (SELECT "bookingMode" FROM "Listing" WHERE id = NEW."listingId") = 'WHOLE_UNIT' THEN
    IF EXISTS (
      SELECT 1 FROM "Booking"
      WHERE "listingId" = NEW."listingId"
        AND id != NEW.id
        AND status IN ('HELD', 'ACCEPTED')
        AND daterange("startDate"::date, "endDate"::date, '[)') &&
            daterange(NEW."startDate"::date, NEW."endDate"::date, '[)')
    ) THEN
      RAISE EXCEPTION 'Overlapping booking for whole-unit listing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_whole_unit_overlap
  BEFORE INSERT OR UPDATE OF status, "startDate", "endDate"
  ON "Booking"
  FOR EACH ROW
  EXECUTE FUNCTION check_whole_unit_overlap();
```
**Race safety:** The `FOR UPDATE` lock on the `Listing` row serializes all concurrent booking inserts for the same listing, preventing TOCTOU races without requiring SERIALIZABLE isolation. This follows the PostgreSQL Wiki's recommended pattern for cross-table constraint triggers (see: [How to avoid overlapping intervals](https://wiki.postgresql.org/wiki/How_to_avoid_overlapping_intervals_with_PostgreSQL), [Winning race conditions with PostgreSQL](https://dev.to/mistval/winning-race-conditions-with-postgresql-54gn)). The codebase's existing SERIALIZABLE usage provides additional defense-in-depth but is not strictly required for this trigger.

---

#### C2. `availableSlots` Can Go Negative — No Floor Clamp on Decrements
**Found by:** Security (95%)

The accept path uses Prisma ORM `{ decrement: N }` which has no floor. During the dual-path period, a PENDING accept decrements without a guard. If a HELD booking's slot was already consumed at creation and a PENDING booking is accepted concurrently, `availableSlots` can go below zero.

**Fix:** Two-layer defense:
1. Add DB constraint: `ALTER TABLE "Listing" ADD CONSTRAINT "listing_available_slots_non_negative" CHECK ("availableSlots" >= 0);`
2. Convert all decrements to conditional UPDATE with hard error on violation (do NOT silently clamp with `GREATEST` — that hides double-accept bugs and corrupts the audit trail):
```sql
UPDATE "Listing"
SET "availableSlots" = "availableSlots" - ${n}
WHERE id = ${listingId} AND "availableSlots" >= ${n}
```
Then check `rowsAffected`:
```typescript
const result = await tx.$executeRaw`...`;
if (result === 0) {
  throw new Error(`Slot underflow rejected: listing ${listingId} has fewer than ${n} available slots`);
}
```
The DB constraint is the safety net; the `WHERE` guard is the primary defense. Together they ensure a double-accept is **detected and rejected**, never silently absorbed.

**Industry precedent:** This is the unanimous consensus pattern from Harry's Engineering (atomic SQL decrements), Airbnb (inventory reservation), ByteByteGo (hotel reservation system design), and the ITNEXT "Solving Double Booking at Scale" analysis. `GREATEST(0, ...)` clamping is explicitly rejected in all sources as "silent data mutation — some of the most dangerous failure modes in SQL" (see: [Atomic Increment/Decrement Operations in SQL](https://blog.pjam.me/posts/atomic-operations-in-sql/), [Solving Double Booking at Scale](https://itnext.io/solving-double-booking-at-scale-system-design-patterns-from-top-tech-companies-4c5a3311d8ea)).

---

#### C3. Feature Flag Zod Pattern Is Wrong
**Found by:** Arch (85%)

Plan proposes `z.coerce.boolean().default(false)`. The string `"false"` is truthy when coerced to boolean — **all flags would be ON by default** in Vercel (where env vars are always strings).

**Fix:** Match existing pattern:
```typescript
ENABLE_MULTI_SLOT_BOOKING: z.enum(["true", "false"]).optional(),
// with getter:
get multiSlotBooking() { return e.ENABLE_MULTI_SLOT_BOOKING === "true"; }
```

---

#### C4. No Rate Limit on `createBooking`
**Found by:** Security (97%)

Verified: `createBooking` in `booking.ts` has zero rate limiting. The plan describes adding one inside the SERIALIZABLE transaction (Step 4c), but `checkRateLimit` does its own DB operations (`deleteMany` → conditional raw `UPDATE` → `findUnique` + `upsert` fallback — a three-branch flow), which inside SERIALIZABLE would cause P2034 conflicts and potential deadlocks.

**Fix:** Add rate limit BEFORE the transaction, with both per-user and per-IP dimensions (matching the login pattern to prevent account-sharing abuse):
```typescript
// At top of createBooking, before Zod parse
await checkRateLimit(userId, 'createBooking', RATE_LIMITS.createBooking);
await checkRateLimit(clientIp, 'createBookingByIp', RATE_LIMITS.createBookingByIp);

// Add to rate-limit.ts:
RATE_LIMITS.createBooking = { limit: 10, windowMs: 60 * 60 * 1000 };       // per user
RATE_LIMITS.createBookingByIp = { limit: 30, windowMs: 60 * 60 * 1000 };   // per IP (higher to avoid shared-network false positives)
```
Per-IP limiting prevents users creating throwaway accounts to circumvent per-user limits.

**Industry consensus:** Rate limiting belongs in middleware/API gateway, well before any database transaction begins. Placing rate limits inside SERIALIZABLE transactions extends transaction duration, increases P2034 conflict probability, and wastes serializable-level resources on requests that should be rejected pre-transaction. See: [Neon: Rate Limiting in Postgres](https://neon.com/guides/rate-limiting), [Zuplo: API Rate Limiting Best Practices](https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025), [Brandur: Idempotent APIs](https://brandur.org/http-transactions) (keeping foreign operations outside atomic phases).

---

#### C5. `NotificationType` Union Not Updated
**Found by:** UI/UX (100%)

The `NotificationType` union in `notifications.ts` and `emailTypeToPreferenceKey` map in `email.ts` have no hold lifecycle entries. TypeScript compilation will fail when creating hold notifications. Additionally, the Prisma `NotificationType` enum in `schema.prisma` (lines 300-309) also lacks HELD variants — a TypeScript-only fix will compile but cause a **Prisma runtime error** when the notification is persisted to the database.

**Fix:** This is both a compile-time AND migration-time change:
1. **DB migration:** Add to `NotificationType` enum in `schema.prisma` and generate migration:
   - `BOOKING_HOLD_REQUEST`
   - `BOOKING_EXPIRED`
   - `BOOKING_HOLD_EXPIRED`
2. **TypeScript:** Add to `notifications.ts` type union
3. **Email:** Add to `email.ts` `emailTypeToPreferenceKey` map + corresponding templates in `email-templates.ts`
4. **Migration safety:** Enum additions are non-destructive (no data backfill needed), but must deploy the migration BEFORE deploying code that creates these notification types.
5. **Rollback note:** `ALTER TYPE ... ADD VALUE` is **irreversible** in PostgreSQL — there is no `ALTER TYPE ... DROP VALUE`. To remove an enum value after it's added, you must drop and recreate the entire enum type with a data migration. Plan accordingly: only add values you are committed to keeping. See: [Prisma Issue #5290](https://github.com/prisma/prisma/issues/5290), [PostgreSQL ALTER TYPE docs](https://www.postgresql.org/docs/current/sql-altertype.html).

---

#### C6. Phase 4 Rollback Not Addressed
**Found by:** Testing (92%)

Once HELD bookings exist with `heldUntil` timestamps, turning `ENABLE_SOFT_HOLDS=false` breaks the accept path: the flag-OFF branch expects PENDING status and tries to decrement already-consumed inventory.

**Fix:** Use a 3-state flag (ON / DRAIN / OFF) instead of boolean, following the LaunchDarkly migration flag pattern and Martin Fowler's feature toggle taxonomy. This eliminates the TOCTOU race inherent in boolean flag toggles by making "stop new creation" and "disable processing" separate, atomic states.

**Implementation:**
```typescript
// In env.ts:
ENABLE_SOFT_HOLDS: z.enum(["on", "drain", "off"]).default("off"),
// Getter:
get softHoldsEnabled() { return e.ENABLE_SOFT_HOLDS === "on"; }
get softHoldsDraining() { return e.ENABLE_SOFT_HOLDS === "drain"; }
```

**Rollback runbook (3 stages):**

**Stage 1 — DRAIN (set `ENABLE_SOFT_HOLDS=drain`):**
1. New hold creation is blocked (`softHoldsEnabled` returns false).
2. Existing holds continue to function: accept-hold path and sweeper remain operational.
3. Users with in-flight holds can still complete their booking or let holds expire naturally.

**Stage 2 — Verify drain complete:**
4. Monitor: `SELECT COUNT(*) FROM "Booking" WHERE status = 'HELD'` → wait for 0.
5. Maximum wait time = longest hold TTL (e.g., 15 minutes). Sweeper handles cleanup automatically.

**Stage 3 — OFF (set `ENABLE_SOFT_HOLDS=off`):**
6. All hold-related code paths are fully disabled.
7. Safe to remove hold feature code in a subsequent deployment.

**Industry references:** [LaunchDarkly Migration Flags](https://launchdarkly.com/docs/guides/flags/migrations) (6-stage migration pattern), [Martin Fowler Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) (Ops Toggles for graceful degradation), [Thoughtworks: Feature Toggles and DB Migrations](https://www.thoughtworks.com/insights/blog/continuous-delivery/feature-toggles-and-database-migrations-part-3) (both toggle states must be valid for current DB state).

**Post-rollback verification queries** (run after Stage 2 confirms drain complete, before Stage 3 OFF):
```sql
-- 1. Confirm no active holds remain:
SELECT COUNT(*) AS active_holds FROM "Booking" WHERE status = 'HELD';
-- Expected: 0

-- 2. Confirm inventory is consistent (no negative slots):
SELECT id, "availableSlots", "totalSlots"
FROM "Listing"
WHERE "availableSlots" < 0 OR "availableSlots" > "totalSlots";
-- Expected: 0 rows

-- 3. Confirm no orphaned hold notifications in queue:
SELECT COUNT(*) FROM "Notification"
WHERE type IN ('BOOKING_HOLD_REQUEST', 'BOOKING_HOLD_EXPIRED')
  AND "createdAt" > NOW() - INTERVAL '1 hour';
-- Expected: 0 (or only historical, not pending delivery)

-- 4. Verify sweeper is no longer finding work:
SELECT COUNT(*) FROM "Booking"
WHERE status = 'HELD' AND "heldUntil" < NOW();
-- Expected: 0
```

**Emergency alternative:** If immediate rollback needed, run `drain_holds.sql` script that atomically expires all HELD bookings and releases inventory.
**Prerequisite:** This script is only valid after Phase 4 migrations have been applied (which add `HELD`/`EXPIRED` enum values and `slotsRequested` column to the `Booking` model — none of these exist in the current schema).
```sql
WITH expired AS (
  UPDATE "Booking" SET status = 'EXPIRED', "version" = "version" + 1
  WHERE status = 'HELD'
  RETURNING "listingId", "slotsRequested"
)
UPDATE "Listing" l
SET "availableSlots" = LEAST(l."availableSlots" + e."slotsRequested", l."totalSlots")
FROM expired e WHERE l.id = e."listingId";
```

---

#### C7. Dangerous Feature Flag Combinations
**Found by:** Testing (95%)

Three combinations produce broken behavior:
- `WHOLE_UNIT=true + MULTI_SLOT=false` → slot count logic conflicts
- `SOFT_HOLDS=true + MULTI_SLOT=false` → capacity check uses COUNT not SUM (wrong for slotsRequested)
- `BOOKING_AUDIT=true + SOFT_HOLDS=false` → reconcile query's `heldUntil > NOW()` filter has NULL handling bug for ACCEPTED bookings

**Fix:** Add Zod `superRefine` cross-validation in `env.ts`. **Important:** This is a hard startup guard — invalid flag combinations will crash the app at boot. This is intentional behavior (fail fast, don't run with broken invariants), matching the existing `env.ts` pattern. Document this operational consequence in the runbook.

**Prerequisite:** Before this superRefine can work, the env vars `ENABLE_WHOLE_UNIT_MODE`, `ENABLE_MULTI_SLOT_BOOKING`, `ENABLE_BOOKING_AUDIT`, and `ENABLE_SOFT_HOLDS` must first be added to `serverEnvSchema` in `src/lib/env.ts`. Currently only `ENABLE_SOFT_HOLDS` is proposed (in C6). Add all four:
```typescript
// In serverEnvSchema (src/lib/env.ts):
ENABLE_MULTI_SLOT_BOOKING: z.enum(["true", "false"]).default("false"),
ENABLE_WHOLE_UNIT_MODE: z.enum(["true", "false"]).default("false"),
ENABLE_SOFT_HOLDS: z.enum(["on", "drain", "off"]).default("off"),  // 3-state per C6
ENABLE_BOOKING_AUDIT: z.enum(["true", "false"]).default("false"),
```

**Cross-validation** (note: `ENABLE_SOFT_HOLDS` uses `"on"` not `"true"` — see C6):
```typescript
.superRefine((data, ctx) => {
  if (data.ENABLE_WHOLE_UNIT_MODE === "true" && data.ENABLE_MULTI_SLOT_BOOKING !== "true") {
    ctx.addIssue({ code: "custom", message: "WHOLE_UNIT requires MULTI_SLOT — app will not start with this combination" });
  }
  if (data.ENABLE_BOOKING_AUDIT === "true" && data.ENABLE_SOFT_HOLDS !== "on") {
    ctx.addIssue({ code: "custom", message: "BOOKING_AUDIT requires SOFT_HOLDS=on for reconcile correctness — app will not start" });
  }
  if (data.ENABLE_SOFT_HOLDS === "on" && data.ENABLE_MULTI_SLOT_BOOKING !== "true") {
    ctx.addIssue({ code: "custom", message: "SOFT_HOLDS requires MULTI_SLOT — capacity check uses COUNT not SUM without it, allowing overbooking" });
  }
});
```
**Deployment note:** Always validate flag combinations in a staging environment before deploying to production. A misconfigured flag will cause immediate startup failure across all instances.

---

### SHOULD-FIX (9 issues — will cause bugs or inconsistencies; S7 elevated to MUST-FIX, S11 retracted as false positive)

#### S1. Advisory Lock Uses Session-Level Variant (critique of planned code, not existing)
**Found by:** Security (83%)

**Note:** `pg_try_advisory_lock` does not exist anywhere in the current codebase. This critiques the implementation guide's **proposed** reconciliation lock, not deployed code.

The plan proposes `pg_try_advisory_lock(42)` which is session-scoped. Prisma's connection pool may return the connection between lock/unlock, leaving the lock held indefinitely.

**Fix:** When implementing the reconciliation lock, use transaction-level lock inside `$transaction`. The `try` variant is critical for serverless — blocking `pg_advisory_xact_lock` could hang until Vercel's function timeout (10-60s) if another invocation holds the lock:
```typescript
await prisma.$transaction(async (tx) => {
  const [{ acquired }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtext('reconcile-slots')) as acquired`;
  if (!acquired) return { skipped: true }; // Another instance is reconciling — safe to skip
  // ... reconciliation logic ...
}); // lock auto-released on commit/rollback
```
**Industry context:** Session-level advisory locks (`pg_advisory_lock`) are fundamentally broken under connection pooling (PgBouncer, Prisma pool, Supabase Supavisor). The lock binds to the *database connection*, which is shared across requests in pooled environments — causing lock leaks and collisions. `pg_try_advisory_xact_lock` auto-releases at COMMIT/ROLLBACK, making it safe under transaction-mode pooling. See: [Vlad Mihalcea: PostgreSQL Advisory Locks](https://vladmihalcea.com/how-do-postgresql-advisory-locks-work/), [PgBouncer Peril](https://jpcamara.com/2023/04/12/pgbouncer-is-useful.html), [Prisma Discussion #16740](https://github.com/prisma/prisma/discussions/16740).

---

#### S2. Sweeper Notifications Inside Transaction
**Found by:** Arch (83%)

HTTP calls to email service hold the DB transaction open. Plan's own `booking.ts`/`manage-booking.ts` correctly pattern notifications outside tx.

**Fix:** Collect expired hold data inside tx, send notifications after tx commits using the returned data.

---

#### S3. Sweeper Doesn't Bump `version`
**Found by:** Security (82%)

After sweeper expires a booking, stale callers with cached booking objects won't detect the change via optimistic lock.

**Fix:** Add `"version" = "version" + 1` to sweeper's booking UPDATE. All writers (including background jobs) must participate in the version protocol, or the protocol breaks — a concurrent user-facing transaction that read the row before expiry could write back stale data, effectively "resurrecting" an expired hold. See: [Baeldung: Optimistic Locking in JPA](https://www.baeldung.com/jpa-optimistic-locking) (OPTIMISTIC_FORCE_INCREMENT mode), [Rails ActiveRecord Locking](https://api.rubyonrails.org/classes/ActiveRecord/Locking/Optimistic.html) ("if you update a row without incrementing the lock_version, you end up with the same problem").

---

#### S4. `heldUntil` Guard Not Atomic with Status Transition (critique of planned code, not existing)
**Found by:** Security (82%)

**Note:** `heldUntil` does not exist in the current schema. This critiques the implementation guide's **proposed** accept-hold path, not deployed code.

When implementing the hold-accept path, the `heldUntil` check should be in the WHERE clause of the UPDATE, not a pre-check:
```sql
WHERE id = ${bookingId} AND status = 'HELD' AND "heldUntil" >= NOW() AND version = ${version}
```

---

#### S5. Facets Route Omitted from Change Map
**Found by:** UI/UX (95%)

`/api/search/facets/route.ts` line 172 has `d.available_slots > 0` — needs the same ghost-hold treatment as `search-doc-queries.ts` (line 430). These are the 2 WHERE filter locations requiring the LEFT JOIN fix. Not listed in plan.

---

#### S6. `SearchResultsClient` Not in Phase 6 Change Map
**Found by:** UI/UX (88%)

Must pass `totalSlots` from `SearchV2ListItem` to `ListingCard` props. Currently maps a subset of fields.

**Implementation note:** The shared `ListingCard` component (from `src/components/listings/ListingCard.tsx`) is imported in 2 callsites: `SearchResultsClient` and `FeaturedListingsClient` (which already includes `totalSlots` in its data type). `UserProfileClient` and `ProfileClient` define their own **local** `ListingCard` functions and are unaffected. If `totalSlots` is added as a required prop on the shared component, update both `SearchResultsClient` and `FeaturedListingsClient` in the same PR. The blast radius is small (2 files), not large.

---

#### S7. Ghost-Hold LEFT JOIN SQL Not Specified — MUST-FIX (elevated from SHOULD-FIX)
**Found by:** Arch (80%) + UI/UX (87%)

**Severity elevated:** This is the core correctness invariant of the soft-hold feature. Wrong JOIN logic causes either over-counting (listing appears unavailable when hold expired) or under-counting (listing appears available when active hold exists). Both are visible, user-facing bugs.

Plan says "compute effective_available during sync" but provides no SQL for `fetchListingSearchData`. This needs a LEFT JOIN on Booking for HELD status with `heldUntil > NOW()`. Non-trivial change to existing raw SQL.

**Concrete SQL template** (must be atomic with slot-count read):
```sql
SELECT
  l.*,
  l."availableSlots" - COALESCE(held.held_count, 0) AS effective_available_slots
FROM "Listing" l
LEFT JOIN (
  SELECT "listingId", COUNT(*) AS held_count
  FROM "Booking"
  WHERE status = 'HELD'
    AND "heldUntil" > NOW()
  GROUP BY "listingId"
) held ON held."listingId" = l.id
WHERE (l."availableSlots" - COALESCE(held.held_count, 0)) > 0
```
For multi-slot mode, replace `COUNT(*)` with `SUM("slotsRequested")`. Add to both locations where the `available_slots > 0` WHERE filter appears: `search-doc-queries.ts` (line 430) and the facets route (see S5, line 172). The 4 SELECT column projections of `available_slots` elsewhere in `search-doc-queries.ts` are read-only and do not require the JOIN treatment.

**Integration into existing query builder** (`search-doc-queries.ts`):

The current code at line 428-431 builds a `conditions[]` array with `"d.available_slots > 0"` as the first condition. The query runs against the `search_documents` materialized view (`d`), not the `Listing` table directly. To integrate the ghost-hold adjustment:

1. **Option A (recommended) — Subquery in WHERE clause** (minimal change to existing builder pattern):
```typescript
// Replace line 430:
//   "d.available_slots > 0",
// With:
`(d.available_slots - COALESCE((
  SELECT COUNT(*) FROM "Booking" b
  WHERE b."listingId" = d.id
    AND b.status = 'HELD'
    AND b."heldUntil" > NOW()
), 0)) > 0`,
```
This avoids restructuring the entire query builder's FROM clause. The partial index `idx_booking_active_holds` makes this a fast index-only lookup per listing.

2. **Same pattern for facets route** (`/api/search/facets/route.ts` line 172):
```typescript
// Replace: d.available_slots > 0
// With the same subquery pattern
```

**Why not a JOIN?** The query builder constructs conditions as an array of WHERE clause strings, joined by `AND`. Injecting a `LEFT JOIN` would require rewriting the `FROM` clause construction, which touches the base query template shared across search, facets, and count queries. The correlated subquery achieves the same result with a localized change.

**Required index** (without this, the LEFT JOIN subquery scans the full Booking table on every search):
```sql
CREATE INDEX idx_booking_active_holds
  ON "Booking" ("listingId", "heldUntil")
  WHERE status = 'HELD';
```
This partial index makes the ghost-hold aggregation O(active_holds_for_listing) instead of O(all_bookings). At Roomshare's expected scale (hundreds to low thousands of active holds), this adds < 5ms to search queries. If profiling later shows the aggregation is still a bottleneck, consider a denormalized `cachedAvailableSlots` counter column maintained by trigger — but measure first. See: [Crunchy Data: JOINs or Subquery in PostgreSQL](https://www.crunchydata.com/blog/joins-or-subquery-in-postgresql-lessons-learned), [Citus: Faster PostgreSQL Counting](https://www.citusdata.com/blog/2016/10/12/count-performance/).

---

#### S8. `FILTER_QUERY_KEYS` Missing from Change Targets
**Found by:** UI/UX (100%)

`search-params.ts` constant `FILTER_QUERY_KEYS` must include `"minSlots"` or canonical param will be dropped during cache-key building. `buildCanonicalFilterParamsFromSearchParams` also needs update.

**Prevention:** Add a TypeScript exhaustiveness check so future filter additions cause a compile error if not added to `FILTER_QUERY_KEYS`:
```typescript
// Compile-time guard: if FilterParams gains a key not in FILTER_QUERY_KEYS, this errors
type _AssertKeysComplete = Exclude<keyof FilterParams, typeof FILTER_QUERY_KEYS[number]> extends never
  ? true
  : { error: "FILTER_QUERY_KEYS is missing keys from FilterParams" };
```
This pattern (from Next.js cache key best practices) ensures cache key completeness is enforced by the type system, not by human vigilance. See: [Next.js Caching Docs](https://nextjs.org/docs/app/guides/caching).

---

#### S9. Orphaned Phase 1 Indexes Not in Cleanup
**Found by:** Arch (88%)

`Booking_v2_by_spot_idx` and `Booking_v2_active_status_idx` will remain as dead indexes after Phase 1 columns are dropped. Add to cleanup migration:
```sql
DROP INDEX IF EXISTS "Booking_v2_by_spot_idx";
DROP INDEX IF EXISTS "Booking_v2_active_status_idx";
```

---

#### S10. PII in Reconciliation Logs
**Found by:** Security (88%)

`console.warn` with raw listing IDs violates CLAUDE.md non-negotiable ("No raw PII in logs (email/phone/IDs/address)" — IDs are explicitly prohibited). Use the project's existing structured logger from cron patterns with HMAC-hashed identifiers:
```typescript
// Instead of: console.warn(`Drift detected for listing ${listingId}`)
// Use the existing structured logger (src/lib/logger.ts):
import { logger } from '@/lib/logger';
import { createHmac } from 'crypto';

// IMPORTANT: Use HMAC, not plain SHA-256. Plain SHA-256 of sequential integer IDs
// is trivially brute-forceable (an attacker can pre-compute all hashes in seconds).
// HMAC with a secret key prevents rainbow table attacks.
const LOG_HMAC_KEY = process.env.LOG_HMAC_SECRET!; // Add to env.ts, rotate periodically
const logSafeId = (id: string) =>
  createHmac('sha256', LOG_HMAC_KEY).update(id).digest('hex').slice(0, 16);

logger.warn('slot-drift-detected', { listingIdHash: logSafeId(listingId), drift: delta });
```
**Notes:**
- `logSafeId` does not exist in the codebase — create it in `src/lib/log-utils.ts` and reuse across cron/sweeper code.
- The `logger` call signature is `logger.warn(message, meta)` (message first, metadata second).
- 16 hex chars (64 bits) is sufficient for log correlation while preventing collision in practice.
- HMAC is recommended over plain SHA-256 by EDPB Guidelines 01/2025 on Pseudonymisation and the OWASP Logging Cheat Sheet. See: [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), [EDPB Pseudonymisation Guidelines](https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-012025-pseudonymisation_en).

---

#### ~~S11. Badge Variant Names Don't Exist~~ — RETRACTED (false positive)
**Found by:** UI/UX (90%) — **INCORRECT**

~~SlotBadge references `success` and `info` variants — only `default`/`secondary`/`destructive`/`outline` exist.~~

**Retraction:** The project's `badge.tsx` already defines `success`, `info`, `warning`, `purple`, `destructive`, `default`, and `outline` variants. This finding incorrectly assumed standard shadcn/ui defaults without reading the actual file. SlotBadge can safely use `success` and `info` variants — no changes needed.

---

### NICE-TO-FIX (7 issues — improvements)

#### N1. NLP "1 room" Ambiguity (future design caution, not a current bug)
**Note:** The current NLP parser (`natural-language-parser.ts`) has no slot-count extraction logic — it handles price, room type, amenities, house rules, and lease duration only. This is a **design caution for when `minSlots` NLP parsing is implemented**, not a pre-existing issue.

When implementing: a naive pattern matching "1 room" as `minAvailableSlots:1` would conflict with room type intent. Start pattern at 2+ or add room-type collision guard.

#### N2. E2E Seed Data Missing
`seed-e2e.js` needs multi-slot listing (`totalSlots=3`) and short-TTL listing (`holdTtlMinutes=2`) for new E2E specs.

#### N3. Listing.version Schema Edit Step Unclear
Add explicit step to Phase 0 checklist: "Edit `schema.prisma` to add `version Int @default(1)` to Listing model."

#### N4. Phase 3/4 Parallel Deployment Claim Wrong
EXCLUSION constraint references HELD status which only exists after Phase 4 enum migration. Phase 3 depends on Phase 4 for the constraint, not parallel.

#### N5. Timeline Underestimate
Phase 4 is realistically 10-14 days, not 5-7 (see revised timeline table). Row-by-row revised sums are 29-39 days; with integration testing, rework buffer, and the 8 MUST-FIX items requiring pre-implementation redesign, the realistic total is **40-60 days (8-12 weeks solo)**.

#### N6. 8 Missing Test Scenarios (organized by blocking phase)

**Phase 2 (Multi-Slot) — must pass before Phase 4:**
- `slotsRequested` parameter validation E2E (0, 999 rejected — validates input boundary)

**Phase 4 (Soft Holds) — blocks Phase 4 sign-off:**
- Flag-OFF with existing HELD bookings (rollback scenario — validates C6 drain runbook)
- Max 3 holds boundary condition (exactly 3 allowed, 4th rejected)
- `holdTtlMinutes` validation at application layer
- **Idempotency key reuse across HELD state — design decision required:** If an idempotency key from a HELD booking is reused after the hold expires, the cached `resultData` JSON returns the original HELD booking result. **Industry consensus (Stripe, Brandur, IETF draft-ietf-httpapi-idempotency-key-header-07): do NOT invalidate idempotency keys on resource state change.** The key is scoped to the *request*, not the *resource*. The correct behavior is to return the cached original response; the client should then check the resource's current state via a separate GET. Use **TTL-based cleanup** (24-48h, matching the existing `expiresAt` field) rather than state-based invalidation. If hold TTLs are shorter than the idempotency key TTL, this is safe — the key expires naturally. See: [Stripe Idempotency](https://stripe.com/blog/idempotency), [Brandur: Idempotency Keys in Postgres](https://brandur.org/idempotency-keys), [IETF Draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
  **Test requirement:** Add a test that verifies replaying a create-hold request after hold expiry returns the original cached result (not an error), and a separate test that the client correctly handles this by checking resource state.

**Phase 5 (Audit) — blocks Phase 5 sign-off:**
- Negative drift in reconciliation (validates reconciliation correctly handles over-credited slots)

**Phase 3 (Whole-Unit) — blocks Phase 3 sign-off:**
- `bookingMode` filter in search results (validates new enum filters correctly in search query)

**Phase 6 (UI) — blocks Phase 6 sign-off:**
- Notification correctness for new hold lifecycle states (validates BOOKING_HOLD_REQUEST, BOOKING_HOLD_EXPIRED render correctly)

#### N7. Mobile Layout for New Components
SlotSelector in non-sticky mobile BookingForm, HoldCountdown positioning on mobile — not addressed.

---

## Corrected Phase Dependency Graph

```
Phase 0 (cleanup) ──> Phase 1 (search filter) ──> Phase 2 (multi-slot)
                                                       │
                                                       ├──> Phase 4 (soft holds) ──> Phase 3 (whole-unit)*
                                                       │                              │
                                                       │                              └──> Phase 5 (audit)
                                                       │
                                                       └──> Phase 6 (UI polish, can start after Phase 2)

* Phase 3's EXCLUSION constraint references HELD status, so Phase 4 enum migration must come first.
  Phase 3 can start its non-constraint work in parallel with Phase 4.
```

## Revised Timeline

| Phase | Original | Revised | Reason |
|-------|----------|---------|--------|
| 0: Cleanup | 2-3 days | 4-5 days | Additional drift items, DB constraint for slot floor, flag cross-validation with startup guard, NotificationType enum migration |
| 1: Search | 2-3 days | 2-3 days | Accurate (add facets route + FILTER_QUERY_KEYS) |
| 2: Multi-Slot | 4-5 days | 5-6 days | Conditional UPDATE with hard error (not silent clamp), per-IP rate limiting |
| 3: Whole-Unit | 2-3 days | 3-4 days | Trigger-based overlap instead of EXCLUSION; Phase 4 dependency |
| 4: Soft Holds | 5-7 days | **10-14 days** | Ghost-hold SQL (elevated MUST-FIX), sweeper fixes, two-phase rollback, idempotency key invalidation, anti-abuse testing |
| 5: Audit | 2-3 days | 2-3 days | Accurate (add advisory lock fix) |
| 6: UI Polish | 2-3 days | 2-3 days | Mobile layout, SearchResultsClient mapping (Badge variants already exist — S11 retracted) |
| Integration/rework buffer | — | 11-21 days | 8 MUST-FIX pre-implementation redesigns, cross-phase integration testing, unexpected rework |
| **Total** | **19-27 days** | **40-60 days** | **8-12 weeks solo** |

## Feature Flag Interaction Matrix

| MULTI_SLOT | WHOLE_UNIT | SOFT_HOLDS | AUDIT | Safe? | Notes |
|------------|------------|------------|-------|-------|-------|
| false | false | off | false | Safe | Current baseline |
| true | false | off | false | Safe | Phase 2 only |
| true | true | off | false | Safe | Phase 2+3, trigger dormant (no HELD) |
| true | false | on | false | Safe | Simplified option (Phases 0-2+4) |
| true | true | on | false | Safe | Full system minus audit |
| true | true | on | true | Safe | Full system |
| true | * | drain | * | Safe | Rollback in progress — no new holds, existing holds drain |
| false | true | * | * | **BROKEN** | WHOLE_UNIT requires MULTI_SLOT (C7 blocks startup) |
| false | false | on | false | **BROKEN** | Capacity uses COUNT not SUM — allows overbooking (C7 blocks startup) |
| * | * | off | true | **LATENT BUG** | Reconcile NULL on heldUntil (C7 blocks startup) |

---

## Per-Phase Acceptance Criteria (exit gates)

Each phase must satisfy its exit criteria before the next phase begins.

### Phase 0: Cleanup
- [ ] `Listing.version Int @default(1)` added to schema, migration applied
- [ ] `CHECK ("availableSlots" >= 0)` constraint added via migration
- [ ] `NotificationType` enum extended with `BOOKING_HOLD_REQUEST`, `BOOKING_EXPIRED`, `BOOKING_HOLD_EXPIRED`
- [ ] All 4 feature flag env vars added to `serverEnvSchema` with `superRefine` cross-validation (C7)
- [ ] `LOG_HMAC_SECRET` added to env, `logSafeId()` utility created in `src/lib/log-utils.ts`
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass
- [ ] Migration is reversible (rollback note documented)

### Phase 1: Search Filter
- [ ] `minSlots` parameter added to `FILTER_QUERY_KEYS` and `FilterParams`
- [ ] Exhaustiveness type check (S8) compiles without error
- [ ] `buildCanonicalFilterParamsFromSearchParams` handles `minSlots`
- [ ] Facets route (`/api/search/facets/route.ts`) includes `minSlots` filter
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass

### Phase 2: Multi-Slot
- [ ] Conditional UPDATE with `WHERE "availableSlots" >= ${n}` replaces `{ decrement: N }` (C2)
- [ ] `slotsRequested` column added to `Booking` model
- [ ] Rate limiting on `createBooking` — per-user + per-IP, outside transaction (C4)
- [ ] `slotsRequested` parameter validation rejects 0 and 999 (E2E test)
- [ ] Double-accept test: two concurrent accepts for last slot → exactly one succeeds
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass

### Phase 3: Whole-Unit
- [ ] `bookingMode` enum added to `Listing` model
- [ ] Trigger `check_whole_unit_overlap()` with `FOR UPDATE` lock deployed (C1)
- [ ] Overlapping booking test: two concurrent WHOLE_UNIT bookings → exactly one succeeds
- [ ] Multi-slot bookings still work for non-WHOLE_UNIT listings (regression test)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass

### Phase 4: Soft Holds
- [ ] `BookingStatus` enum extended with `HELD`, `EXPIRED`
- [ ] `heldUntil` column added to `Booking`
- [ ] Ghost-hold subquery integrated into `search-doc-queries.ts` and facets route (S7)
- [ ] Partial index `idx_booking_active_holds` created
- [ ] Sweeper: expires holds, bumps `version`, sends notifications outside tx (S2, S3)
- [ ] Advisory lock uses `pg_try_advisory_xact_lock` (S1)
- [ ] Rollback runbook tested: DRAIN → verify → OFF with all 4 verification queries passing (C6)
- [ ] Flag-OFF with existing HELD bookings test passes (N6)
- [ ] Max 3 holds boundary test passes (N6)
- [ ] Idempotency key replay test passes (N6)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass

### Phase 5: Audit
- [ ] Reconciliation job runs with `pg_try_advisory_xact_lock`
- [ ] `logSafeId()` used for all IDs in reconciliation logs (S10)
- [ ] Negative drift detection test passes (N6)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass

### Phase 6: UI Polish
- [ ] `SlotSelector` component renders in `BookingForm`
- [ ] `HoldCountdown` component with server-synced clock offset
- [ ] `totalSlots` passed through `SearchResultsClient` → `ListingCard` (S6)
- [ ] Mobile layout for SlotSelector and HoldCountdown (N7)
- [ ] Notification templates render for new hold lifecycle types (N6)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass

---

## Consolidated File Change Checklist (by phase)

Files marked with `*` are touched in multiple phases — merge carefully.

### Phase 0: Cleanup
| File | Change | Issue |
|------|--------|-------|
| `prisma/schema.prisma`* | Add `version Int @default(1)` to `Listing`, extend `NotificationType` enum | N3, C5 |
| `prisma/migrations/` | New migration: Listing.version, CHECK constraint, NotificationType values | N3, C2, C5 |
| `src/lib/env.ts`* | Add 4 feature flag env vars + `superRefine` cross-validation | C3, C6, C7 |
| `src/lib/log-utils.ts` | **NEW** — `logSafeId()` HMAC utility | S10 |
| `src/lib/notifications.ts` | Add `BOOKING_HOLD_REQUEST`, `BOOKING_EXPIRED`, `BOOKING_HOLD_EXPIRED` to type union | C5 |
| `src/lib/email.ts` | Add hold lifecycle entries to `emailTypeToPreferenceKey` | C5 |
| `src/lib/email-templates.ts` | Add hold notification email templates | C5 |

### Phase 1: Search Filter
| File | Change | Issue |
|------|--------|-------|
| `src/lib/search-params.ts` | Add `minSlots` to `FILTER_QUERY_KEYS` + `FilterParams` + exhaustiveness type check | S8 |
| `src/lib/search/search-doc-queries.ts`* | Add `minSlots` WHERE condition | S8 |
| `src/app/api/search/facets/route.ts`* | Add `minSlots` filter | S5, S8 |

### Phase 2: Multi-Slot
| File | Change | Issue |
|------|--------|-------|
| `prisma/schema.prisma`* | Add `slotsRequested Int @default(1)` to `Booking` | — |
| `prisma/migrations/` | New migration: Booking.slotsRequested | — |
| `src/app/actions/manage-booking.ts` | Replace `{ decrement: 1 }` with conditional `$executeRaw` UPDATE | C2 |
| `src/app/actions/booking.ts`* | Add `slotsRequested` to create flow, conditional UPDATE | C2 |
| `src/lib/rate-limit.ts` | Add `createBooking` + `createBookingByIp` to `RATE_LIMITS` | C4 |
| `src/app/actions/booking.ts`* | Add `checkRateLimit` calls before transaction | C4 |
| `scripts/seed-e2e.js` | Add `totalSlots: 3` listing + `holdTtlMinutes: 2` listing | N2 |

### Phase 3: Whole-Unit
| File | Change | Issue |
|------|--------|-------|
| `prisma/schema.prisma`* | Add `bookingMode` enum + field to `Listing` | — |
| `prisma/migrations/` | New migration: bookingMode enum, trigger `check_whole_unit_overlap()` | C1 |

### Phase 4: Soft Holds
| File | Change | Issue |
|------|--------|-------|
| `prisma/schema.prisma`* | Extend `BookingStatus` with `HELD`/`EXPIRED`, add `heldUntil DateTime?` | — |
| `prisma/migrations/` | New migration: BookingStatus values, heldUntil, partial index `idx_booking_active_holds` | S7 |
| `src/lib/search/search-doc-queries.ts`* | Replace `d.available_slots > 0` with ghost-hold subquery | S7 |
| `src/app/api/search/facets/route.ts`* | Same ghost-hold subquery replacement | S5, S7 |
| `src/lib/env.ts`* | `ENABLE_SOFT_HOLDS` already added in Phase 0 — verify getter works | C6 |
| `src/app/actions/booking.ts`* | Hold creation path, `heldUntil` setting, flag-gated | C6 |
| `src/lib/sweeper.ts` | **NEW or MODIFIED** — hold expiry sweeper with `FOR UPDATE SKIP LOCKED`, version bump, notifications outside tx | S2, S3 |
| `src/lib/idempotency.ts` | TTL-based cleanup (no state-based invalidation) | N6 |

### Phase 5: Audit
| File | Change | Issue |
|------|--------|-------|
| `src/lib/reconciliation.ts` | **NEW** — slot reconciliation with `pg_try_advisory_xact_lock`, `logSafeId()` | S1, S10 |

### Phase 6: UI Polish
| File | Change | Issue |
|------|--------|-------|
| `src/components/listings/ListingCard.tsx` | Accept `totalSlots` prop, render `SlotBadge` | S6 |
| `src/components/search/SearchResultsClient.tsx` | Map `totalSlots` from `SearchV2ListItem` to `ListingCard` props | S6 |
| `src/components/FeaturedListingsClient.tsx` | Verify `totalSlots` prop passing (already in data type) | S6 |
| `src/components/SlotSelector.tsx` | **NEW** — slot selection UI with mobile layout | N7 |
| `src/components/HoldCountdown.tsx` | **NEW** — server-synced countdown timer | — |
| `src/components/BookingForm.tsx` | Integrate SlotSelector + HoldCountdown | N7 |

### Cleanup (post all phases)
| File | Change | Issue |
|------|--------|-------|
| `prisma/migrations/` | Drop orphaned indexes `Booking_v2_by_spot_idx`, `Booking_v2_active_status_idx` | S9 |

---

## Industry References (verified via deep research)

All recommendations in this review are backed by established industry patterns, not assumptions:

| Topic | Key Sources |
|-------|------------|
| Conditional UPDATE vs GREATEST clamp | Harry's Engineering, ByteByteGo Hotel Reservation, ITNEXT "Solving Double Booking at Scale" |
| Optimistic locking / version bumps | Baeldung JPA, Rails ActiveRecord, ByteByteGo Optimistic Locking |
| Feature flag rollback with stateful resources | LaunchDarkly Migration Flags, Martin Fowler Feature Toggles, Thoughtworks DB Migrations Part 3 |
| Rate limiting placement | Neon Postgres Rate Limiting, Zuplo Best Practices, Brandur Idempotent APIs |
| Advisory locks under connection pooling | Vlad Mihalcea, PgBouncer analysis (JP Camara), Prisma Discussion #16740 |
| Idempotency key lifecycle | Stripe Blog, Brandur Idempotency Keys, IETF draft-ietf-httpapi-idempotency-key-header-07 |
| Ghost-hold SQL patterns | Crunchy Data JOINs/Subquery, Citus Counting Performance, ByteByteGo Hotel Reservation |
| Trigger-based cross-table constraints | PostgreSQL Wiki Overlapping Intervals, Dan Svetlov Isolation Anomalies |
| Enum migration safety | Prisma Issues #5290/#7251/#8424, PostgreSQL ALTER TYPE docs |
| PII hashing in logs | OWASP Logging Cheat Sheet, EDPB Guidelines 01/2025 on Pseudonymisation |
| Cache key completeness | Next.js Caching docs, Cloudflare Cache Keys, No-Vary-Search spec |
