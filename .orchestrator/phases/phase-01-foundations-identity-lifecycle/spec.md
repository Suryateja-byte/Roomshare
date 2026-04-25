# Phase 01 — Foundations & Identity Lifecycle (Spec)

This phase lands the canonical write-side schema (`physical_units`, `host_unit_claims`,
`listing_inventories`) plus versioned identity (`unit_identity_epoch`, `identity_mutations`),
operational scaffolding (`outbox_events`, `cache_invalidations`, `audit_events`), and the
moderation-precedence / advisory-lock / idempotency primitives that every later phase depends
on. Nothing in the public read path is rewired; all new tables are write-only and guarded by
`phase01_canonical_writes_enabled` (defaults `false`). Invalid row shapes (category matrix),
whitespace-variant duplicate addresses, and host-role edits of moderation columns all reject
at the DB boundary. `Listing`, `Location`, `Booking`, and `ListingDayInventory` are not
touched. Booking-era scaffolding is retired in Phase 09, not here.

---

## Ambiguity resolutions

### (A) Does existing `AuditLog` satisfy `audit_events`?

**Answer: NO — add a new `audit_events` table.**

`prisma/schema.prisma:515` defines `AuditLog` with `adminId String @id …` and a non-nullable
`admin User @relation("AuditLogs", fields: [adminId], references: [id])`. The `AdminAction`
union in `src/lib/audit.ts:9-30` is specifically admin-only (USER_SUSPENDED, LISTING_DELETED,
etc.). Canonical write events (`IDENTITY_MUTATION`, `MODERATION_LOCKED_REJECTED`,
`CANONICAL_UNIT_RESOLVED`, system-actor writes from outbox workers) have no `adminId`. Making
`adminId` nullable and re-purposing `AuditLog` would bleed admin-specific indexes and
validation into a general-purpose ledger and is also a higher-risk migration than adding a
sibling table. Phase 01 therefore introduces `audit_events` alongside `AuditLog`; admin
tooling continues to write `AuditLog`, while canonical/system events write `audit_events`.
Subsequent phases may migrate `AuditLog` rows into `audit_events` (out of scope here).

### (B) Does existing `IdempotencyKey` satisfy Phase 01 `idempotency_keys`?

**Answer: YES — reuse the existing `IdempotencyKey` model (no schema change). Add a new
server-side helper that scopes admission to canonical mutations.**

`prisma/schema.prisma:551-565` exposes `IdempotencyKey(id, key, userId, endpoint, status,
requestHash, resultData, createdAt, expiresAt)` with uniqueness on `(userId, endpoint, key)`
and a 24h TTL — an exact match for master-plan §6.5 semantics. `src/lib/idempotency.ts:113`
already implements the SERIALIZABLE + `INSERT … ON CONFLICT … FOR UPDATE` admission pattern.
Phase 01 admission for new canonical flows reuses `withIdempotency(key, userId, endpoint,
body, op)` with `endpoint` values `"identity:resolveOrCreateUnit"`,
`"identity:mutateUnit"`, and (scaffold only; no caller yet) `"identity:contact"`. No schema
change; only a thin helper that centralizes those endpoint literals.

### (C) Co-existence of new tables with existing `Listing`

This is the single highest-risk ambiguity. Per master-plan §6.3, `listing_inventories` is
the rentable-space concept while `Listing` (from `prisma/schema.prisma:103`) is the
public-facing row hosts edit today. Phases 01–08 run both side-by-side; Phase 09 is the
cutover. The co-existence contract for Phase 01:

1. **No FK between `listing_inventories.unit_id` and `Listing`.** Only `listing_inventories.unit_id
   → physical_units.id`.
2. **Mapping during co-existence**: a new column `listing_inventory_id TEXT NULL` is NOT
   added to `Listing` in Phase 01 (that backfill belongs to Phase 08). Phase 01 only
   introduces a nullable `physical_unit_id TEXT NULL` column on `Listing` — optional,
   unindexed at first — so that Phase 02 workers can begin writing the mapping without
   another migration. The column has no consumers in Phase 01.
3. **Cardinality**: one `physical_units` row MAY serve many `Listing` rows during
   co-existence (multiple hosts / duplicate submits land on the same canonical unit). One
   `Listing` maps to at most one `physical_units` row. Phase 01 does not enforce this
   cardinality beyond the nullable FK (no unique index).
4. **Inventory-to-listing mapping**: `listing_inventories` rows can exist without any
   `Listing` row during Phase 01 (write-only) and vice versa (the existing production
   `Listing` corpus has no counterpart until Phase 02 backfills).

**Risk flag**: if Phase 02 reveals that a 1-to-many co-existence creates ambiguous host
ownership during edits, we will need a decision to either (a) add a `primary_listing_id`
pointer on `physical_units` or (b) route Phase 02 publishing through a more opinionated
`listing_inventories` lookup. This spec does **not** pre-commit; Phase 02 owns that call.

### (D) Moderation vs host role

Reading `src/auth.ts:44-109`, `src/auth.config.ts`, and `src/lib/auth-helpers.ts`: the app
authenticates with NextAuth JWT sessions and carries a single `User.isAdmin` boolean
(`prisma/schema.prisma:54`, forwarded to the session at `src/auth.ts:120`). No role is
currently threaded to the DB. Phase 01 therefore introduces a lightweight request-scoped
transaction wrapper that sets a local GUC variable:

```ts
// src/lib/db/with-actor.ts (new, server-only)
type ActorRole = 'host' | 'moderator' | 'system';
export async function withActor<T>(role: ActorRole, actorId: string | null,
  fn: (tx: TransactionClient) => Promise<T>): Promise<T>
```

Inside the transaction:

```sql
SELECT set_config('app.actor_role', $1, true);
SELECT set_config('app.actor_id',   $2, true);
```

`set_config(..., true)` is transaction-scoped and auto-resets on commit/rollback. The
moderation-precedence trigger reads `current_setting('app.actor_role', true)`. The default
(missing) value is treated as `'system'`, because any write path that has not been migrated
to `withActor` must be either a system cron or a seed script (neither of which should be
blocked by host/moderation rules). **Every new caller in Phase 01 that writes to
`physical_units`, `host_unit_claims`, or `listing_inventories` must use `withActor`.**
Tests assert that a trigger sees `'host'` when that wrapper is used and rejects accordingly.

### (E) `canonicalizer_version` scheme

**Answer: format `"v{MAJOR}.{MINOR}-{YYYY-MM}"`; initial value `"v1.0-2026-04"`.**

Lives as a single exported constant `CANONICALIZER_VERSION` in
`src/lib/identity/canonicalizer-version.ts`. Incrementing the version requires a new
migration that bumps a DB-side default AND appends an `identity_mutations` row of kind
`CANONICALIZER_UPGRADE` — neither of which is in Phase 01's scope beyond declaring the
constant.

### (F) Advisory-lock namespace

Existing in-repo idiom (confirmed via grep): `pg_advisory_xact_lock(hashtext(<string_key>))`,
e.g. `src/lib/hold-constants.ts:8` (`"sweeper-expire-holds"`), `src/app/api/listings/route.ts:431`
(`hashtext(${userId})`). Phase 01's canonical-unit resolve-or-create adopts the **string-keyed
namespace** convention and reserves the prefix `"p1:"`:

```ts
// src/lib/identity/advisory-locks.ts (new)
export const LOCK_PREFIX_CANONICAL_UNIT = 'p1:unit:';
export const LOCK_PREFIX_IDENTITY_MUTATION = 'p1:idmut:';

/** 64-bit advisory-lock key derived from the canonical address hash. */
export function canonicalUnitLockKey(canonicalAddressHash: string): string {
  return `${LOCK_PREFIX_CANONICAL_UNIT}${canonicalAddressHash}`;
}
```

At the SQL boundary the wrapper uses `pg_advisory_xact_lock(hashtext(${key}))` — identical
shape to the sweeper and listings routes. Grep-verified: no existing key in the codebase
starts with `"p1:"`, so collision with the previous lock space (listings userId, sweeper,
reconciler, chat conv-pair, search alerts, freshness, stale-auto-pause) is impossible modulo
a `hashtext` collision, which is acceptable for transaction-scoped locks because the worst
case is false-serialization (not correctness loss).

### (G) Category matrix forced-null columns (verbatim from §6.6)

| Category       | Required                                         | Forced NULL                                                          |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| ENTIRE_PLACE   | `capacity_guests`, availability window, `price`  | `total_beds`, `open_beds`, `gender_preference`, `household_gender`   |
| PRIVATE_ROOM   | `capacity_guests`, availability window, `price`  | `total_beds`, `open_beds`                                            |
| SHARED_ROOM    | `total_beds`, `open_beds`, availability window, `price` | `capacity_guests`                                             |

"Availability window" means both `available_from` and `availability_range` (`tstzrange`) are
NOT NULL. `price` is always NOT NULL. The CHECK constraints encode the matrix column-by-column
(three CHECKs total, one per category, each a `CASE WHEN room_category = 'X' THEN …` boolean).

### (H) `cache_invalidations` shape in Phase 01

Scaffolded now; consumed in Phase 02 and Phase 08. Fields:

```sql
CREATE TABLE "cache_invalidations" (
  id                      TEXT PRIMARY KEY,       -- cuid
  unit_id                 TEXT NOT NULL,          -- physical_units.id (no FK: may outlive the unit row after split)
  projection_epoch        BIGINT NOT NULL,        -- monotonic per-deploy
  unit_identity_epoch     INTEGER NOT NULL,       -- carried from the mutation
  reason                  TEXT NOT NULL,          -- enum-like text: 'TOMBSTONE'|'IDENTITY_MUTATION'|'REPUBLISH'
  enqueued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at             TIMESTAMPTZ NULL,       -- NULL = still queued; set by Phase 02 worker
  consumed_by             TEXT NULL               -- worker id (Phase 02+)
);
CREATE INDEX ON "cache_invalidations" (consumed_at) WHERE consumed_at IS NULL;
CREATE INDEX ON "cache_invalidations" (unit_id, enqueued_at DESC);
```

No producer, no consumer in Phase 01 — the identity-mutation ledger ONLY emits an outbox event
of kind `IDENTITY_MUTATION`; Phase 02 adds the handler that drains into `cache_invalidations`.
Phase 01 tests assert the table exists, accepts a manual insert, and both indexes are present.

### (I) `outbox_events` shape in Phase 01

Canonical shape (master-plan §6.5 + §14 worker requirements):

```sql
CREATE TABLE "outbox_events" (
  id                      TEXT PRIMARY KEY,       -- cuid
  aggregate_type          TEXT NOT NULL,          -- 'PHYSICAL_UNIT' | 'LISTING_INVENTORY' | 'HOST_UNIT_CLAIM' | 'IDENTITY_MUTATION'
  aggregate_id            TEXT NOT NULL,          -- row id
  kind                    TEXT NOT NULL,          -- 'UNIT_UPSERTED' | 'INVENTORY_UPSERTED' | 'IDENTITY_MUTATION' | 'TOMBSTONE'
  payload                 JSONB NOT NULL,         -- redacted fields only; schema-validated by worker in Phase 02
  source_version          BIGINT NOT NULL,        -- monotonic per-aggregate
  unit_identity_epoch     INTEGER NOT NULL,       -- epoch at the time of write
  priority                SMALLINT NOT NULL DEFAULT 100, -- 0 = highest (tombstone/identity), 100 = normal
  status                  TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'IN_FLIGHT' | 'COMPLETED' | 'DLQ'
  attempt_count           INTEGER NOT NULL DEFAULT 0,
  next_attempt_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error              TEXT NULL,
  dlq_reason              TEXT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON "outbox_events" (status, priority, next_attempt_at) WHERE status IN ('PENDING','IN_FLIGHT');
CREATE INDEX ON "outbox_events" (aggregate_type, aggregate_id, source_version);
CREATE INDEX ON "outbox_events" (status, created_at) WHERE status = 'DLQ';
```

Phase 01 **writes** outbox events (from identity mutations, from resolve-or-create) inside
the same transaction as canonical-table writes. It does **not** run any worker. Phase 02
adds the worker polling logic.

### (J) `phase01_canonical_writes_enabled` flag

**Answer: env-var-backed getter on the existing `features` object in `src/lib/env.ts`.**

Grep confirmed flags today live in `src/lib/env.ts:438` (`features`) with env reads like
`process.env.ENABLE_MULTI_SLOT_BOOKING === 'true'`. Phase 01 adds:

```ts
// src/lib/env.ts, inside the existing `features` object
get phase01CanonicalWrites() {
  return process.env.FEATURE_PHASE01_CANONICAL_WRITES === 'true';
},
```

Additionally, a new module `src/lib/flags/phase01.ts` is introduced as the single import
surface that later phases will migrate to (`import { isPhase01CanonicalWritesEnabled }
from '@/lib/flags/phase01'`). The module re-exports the `features.phase01CanonicalWrites`
read and also defines the `killSwitches` stub enumeration from scope §"Feature flag
scaffolding module" (see Function Signatures). No caller observes the flag in Phase 01;
tests assert the module exports exist and default to `false`.

### (K) Reverse plan policy

Per project memory, pre-launch dummy data means destructive migrations are OK. For Phase 01
the recommendation is:

1. Every migration ships with a **rollback SQL block** appended as a comment at the bottom
   of `migration.sql` (following the repo's existing idiom, e.g.
   `prisma/migrations/20260325000000_protect_booking_integrity/migration.sql:42-55`).
2. Rollback is executed **manually** — the operator copies the rollback SQL into `psql`.
   No `down.sql` tooling exists in this repo and none is being added.
3. The README.md inside each migration directory documents (a) data-safety notes (all
   phase-01 tables are empty on creation; no backfill), (b) whether the rollback is
   fully reversible or requires a seed rebuild (all three migrations are fully reversible
   by `DROP TABLE … CASCADE`), (c) lock footprint (`AccessExclusiveLock` during CREATE
   TABLE; negligible on an empty table).
4. For catastrophic drift, the escape hatch is the existing `scripts/seed-e2e.js` pipeline
   plus a `git revert` of the migration directory — no data exists yet to restore.

Justification: adding a `down.sql` tool in Phase 01 would introduce a convention that no
other migration follows; maintaining two styles is a maintenance burden. Rollback-SQL
comments plus README notes exactly match the existing repo idiom and are unambiguous.

---

## Files & Changes

### DB / migrations (new files only)

1. `prisma/migrations/20260501000000_phase01_canonical_identity_tables/migration.sql`
   — Create `physical_units`, `host_unit_claims`, `listing_inventories`, `identity_mutations`,
   `outbox_events`, `cache_invalidations`, `audit_events`. Category-matrix CHECKs, canonical
   unique index, column defaults, indexes.
2. `prisma/migrations/20260501000000_phase01_canonical_identity_tables/README.md`
   — Migration notes (data-safety, rollback, lock footprint).
3. `prisma/migrations/20260501010000_phase01_moderation_precedence_trigger/migration.sql`
   — Install `enforce_moderation_precedence()` function and `BEFORE UPDATE` trigger on each
   of the three canonical tables. `SECURITY DEFINER` is NOT used; the trigger uses
   `current_setting('app.actor_role', true)`.
4. `prisma/migrations/20260501010000_phase01_moderation_precedence_trigger/README.md`
5. `prisma/migrations/20260501020000_phase01_add_listing_physical_unit_id/migration.sql`
   — Add nullable `physical_unit_id TEXT NULL` column to `Listing` (no index; no FK in
   Phase 01 — Phase 02 owns the FK). Rationale captured in (C) above.
6. `prisma/migrations/20260501020000_phase01_add_listing_physical_unit_id/README.md`

### Prisma schema

7. `prisma/schema.prisma` — append seven new models (one per new table) and the
   `physical_unit_id String?` field on `Listing`. No field removals. No relation FKs that
   the read path could observe. All new model names use snake_case `@@map` to match SQL
   table names; Prisma field names follow existing camelCase convention.

### `src/lib/identity/` (new)

8. `src/lib/identity/canonicalizer-version.ts` — `CANONICALIZER_VERSION` const + `isCurrent()`
   helper.
9. `src/lib/identity/canonical-address.ts` — `canonicalizeAddress({address, city, state,
   zip, unit})` returning `{canonicalAddressHash, canonicalUnit, canonicalizerVersion}`.
   SHA-256 of the normalized tuple, base64url encoded, 32 chars.
10. `src/lib/identity/advisory-locks.ts` — lock-key constants + `canonicalUnitLockKey(hash)`
    helper.
11. `src/lib/identity/resolve-or-create-unit.ts` — main write-path entry. Takes a tx + parsed
    address, returns `{unitId, epoch, created}`. Acquires advisory lock, idempotent upsert,
    appends `outbox_events(UNIT_UPSERTED)` in the same tx.
12. `src/lib/identity/mutate-unit.ts` — records a MERGE / SPLIT / CANONICALIZER_UPGRADE
    / MANUAL_MODERATION row in `identity_mutations`, bumps `unit_identity_epoch` on affected
    physical units, appends `outbox_events(IDENTITY_MUTATION)` in the same tx.
13. `src/lib/identity/errors.ts` — `ModerationLockedError` (→ 423 Locked), `StaleVersionError`
    (→ 409), `AdvisoryLockContentionError` (→ 503 transient).

### `src/lib/validation/category/` (new)

14. `src/lib/validation/category/schema.ts` — zod discriminated union over `room_category`.
    Validates required vs forced-null per §6.6. Matches DB CHECK semantics 1:1.
15. `src/lib/validation/category/index.ts` — `validateInventoryInput(input)` returning
    `{ok: true, normalized}` or `{ok: false, issues}`.

### `src/lib/db/` (new)

16. `src/lib/db/with-actor.ts` — `withActor<T>(role, actorId, fn)` transaction wrapper;
    `SELECT set_config('app.actor_role', …, true)` inside the tx.
17. `src/lib/db/optimistic-lock.ts` — small helper `requireRowVersion(row, ifMatch)` that
    throws `StaleVersionError` if the client's `If-Match` disagrees. Used by Phase 01 write
    helpers; no HTTP layer yet.

### `src/lib/outbox/` (new)

18. `src/lib/outbox/append.ts` — `appendOutboxEvent(tx, {aggregateType, aggregateId, kind,
    payload, sourceVersion, unitIdentityEpoch, priority?})`. Single public function; no
    worker; no consumer.

### `src/lib/audit/` (new, peer of existing `src/lib/audit.ts`)

19. `src/lib/audit/events.ts` — `recordAuditEvent(tx, {actorRole, actorId, kind,
    aggregateType, aggregateId, details, requestId?, unitIdentityEpoch?})`. Writes
    `audit_events` row inside the caller's transaction. Must NOT log PII — `details` is JSONB
    with an allowlist (enforced by a zod schema in this file).

### `src/lib/flags/` (new)

20. `src/lib/flags/phase01.ts` — re-export `isPhase01CanonicalWritesEnabled()` plus a stubbed
    `killSwitches` enum (`disable_new_publication`, `pause_identity_reconcile`) whose reads
    always return `false` in Phase 01.

### `src/lib/idempotency.ts` (modification — thin)

21. Append three string constants (`IDEMPOTENCY_ENDPOINT_RESOLVE_UNIT`,
    `IDEMPOTENCY_ENDPOINT_MUTATE_UNIT`, `IDEMPOTENCY_ENDPOINT_CONTACT`) — no behavioral
    change. These are the only edits to this file.

### `src/lib/env.ts` (modification — thin)

22. Append one getter `phase01CanonicalWrites` into the existing `features` object
    (§438-). No other edits.

### Tests

All test paths mirror source. One test file per module; one integration test per DB
migration. See "Test Plan" below for exhaustive mapping.

23. `src/__tests__/lib/identity/canonical-address.test.ts`
24. `src/__tests__/lib/identity/advisory-locks.test.ts`
25. `src/__tests__/lib/identity/resolve-or-create-unit.test.ts`
26. `src/__tests__/lib/identity/mutate-unit.test.ts`
27. `src/__tests__/lib/validation/category/schema.test.ts`
28. `src/__tests__/lib/db/with-actor.test.ts`
29. `src/__tests__/lib/outbox/append.test.ts`
30. `src/__tests__/lib/audit/events.test.ts`
31. `src/__tests__/lib/flags/phase01.test.ts`
32. `src/__tests__/db/phase01-schema.test.ts` — integration: every CHECK rejects
    bad rows; canonical unique index collapses whitespace variants; trigger rejects
    host-role UPDATE of moderation columns.
33. `src/__tests__/db/phase01-moderation-precedence.test.ts` — trigger-focused.
34. `src/__tests__/db/phase01-advisory-lock-contention.test.ts` — 10 parallel
    resolve-or-create → 1 physical_units row.
35. `src/__tests__/integration/phase01-identity-mutation.test.ts` — MERGE/SPLIT
    ledger + outbox emission in one tx.
36. `src/__tests__/integration/phase01-read-path-isolation.test.ts` — asserts
    LSP `findReferences` equivalent via grep: no production code references new
    tables yet.

### Out of files & changes (explicit non-scope)

- NO changes to `Listing`, `Booking`, `ListingDayInventory`, `Location`, `AuditLog`,
  `Conversation`, `Message`, `SavedListing`, `Notification`, `SavedSearch`,
  `VerificationRequest`, `BlockedUser`, `IdempotencyKey`, `RateLimitEntry`,
  `BookingAuditLog`, `TypingStatus`, `ConversationDeletion`, `RecentlyViewed`,
  `ReviewResponse`, `Report`, `Review`, `User`, `Account`, `Session`,
  `VerificationToken`, `PasswordResetToken`. (The sole exception: one nullable column
  added to `Listing` as documented in (C) above.)
- NO Stripe / entitlement / paywall / payments models (Phase 06).
- NO projection tables (`inventory_search_projection`, `unit_public_projection`,
  `semantic_inventory_projection`) — Phase 02.
- NO worker processes. Outbox is write-only in Phase 01.
- NO public read path edits — `src/app/search/**`, `src/lib/search/**`, `src/components/**`
  are untouched.

---

## Function Signatures

### `src/lib/identity/canonicalizer-version.ts`

```ts
/** Identifier encoding the normalization ruleset. Bump on any address-normalization rule change. */
export const CANONICALIZER_VERSION = 'v1.0-2026-04' as const;

/** Returns true if the given version string matches the currently active normalizer. */
export function isCurrentCanonicalizerVersion(v: string): boolean;
```

### `src/lib/identity/canonical-address.ts`

```ts
export interface RawAddressInput {
  address: string;       // raw street + line 2 concatenated, as entered
  city: string;
  state: string;         // 2-letter US or full for non-US
  zip: string;
  unit?: string | null;  // empty string and null are equivalent
  country?: string;      // optional; defaults to 'US'
}

export interface CanonicalAddressOutput {
  /** Deterministic hash; 32-char base64url of SHA-256(normalizedTuple). */
  canonicalAddressHash: string;
  /** Normalized unit string. Empty/whitespace/NULL collapse to the single token `"_none_"`. */
  canonicalUnit: string;
  /** Matches CANONICALIZER_VERSION at call time. */
  canonicalizerVersion: string;
}

/**
 * Normalize raw address fields into a stable canonical identity.
 * Rules: trim + collapse internal whitespace; uppercase state; zip = first 5 digits;
 * strip punctuation; lowercase everything after normalization.
 */
export function canonicalizeAddress(input: RawAddressInput): CanonicalAddressOutput;
```

### `src/lib/identity/advisory-locks.ts`

```ts
export const LOCK_PREFIX_CANONICAL_UNIT = 'p1:unit:' as const;
export const LOCK_PREFIX_IDENTITY_MUTATION = 'p1:idmut:' as const;

/** Lock-key string for canonical-unit resolve-or-create. Use with pg_advisory_xact_lock(hashtext(...)). */
export function canonicalUnitLockKey(canonicalAddressHash: string): string;

/** Lock-key string for a per-unit identity mutation. */
export function identityMutationLockKey(unitId: string): string;

/** Acquire a transaction-scoped advisory lock; no-op return. Wraps pg_advisory_xact_lock. */
export async function acquireXactLock(tx: TransactionClient, key: string): Promise<void>;
```

### `src/lib/identity/resolve-or-create-unit.ts`

```ts
export interface ResolveOrCreateUnitInput {
  address: RawAddressInput;
  actor: { role: 'host' | 'moderator' | 'system'; id: string | null };
  requestId?: string;
}

export interface ResolveOrCreateUnitResult {
  unitId: string;
  unitIdentityEpoch: number;
  created: boolean;
  canonicalAddressHash: string;
}

/**
 * Resolve or create the canonical physical_units row for the given address.
 * Requires an open transaction. Acquires canonicalUnitLockKey; upserts into physical_units
 * keyed on (canonical_address_hash, canonical_unit); appends outbox_events(UNIT_UPSERTED);
 * records audit_events(CANONICAL_UNIT_RESOLVED). SERIALIZABLE isolation assumed.
 * Throws AdvisoryLockContentionError if the lock is held > timeout (set to 5 s).
 */
export async function resolveOrCreateUnit(
  tx: TransactionClient,
  input: ResolveOrCreateUnitInput
): Promise<ResolveOrCreateUnitResult>;
```

### `src/lib/identity/mutate-unit.ts`

```ts
export type IdentityMutationKind = 'MERGE' | 'SPLIT' | 'CANONICALIZER_UPGRADE' | 'MANUAL_MODERATION';

export interface IdentityMutationInput {
  kind: IdentityMutationKind;
  fromUnitIds: string[];          // must be non-empty; single-element for SPLIT
  toUnitIds: string[];            // must be non-empty; single-element for MERGE
  reasonCode: string;             // allowlisted strings per 6.15
  operatorId: string | null;      // null for system-triggered (canonicalizer upgrade worker)
}

export interface IdentityMutationResult {
  mutationId: string;
  resultingEpoch: number;
  affectedUnitIds: string[];
}

/**
 * Append an identity_mutations ledger row, bump unit_identity_epoch on all affected units,
 * emit outbox_events(IDENTITY_MUTATION) in the same transaction. No downstream reconciliation
 * in Phase 01; the identity reconciler worker is added in a later phase.
 */
export async function recordIdentityMutation(
  tx: TransactionClient,
  input: IdentityMutationInput
): Promise<IdentityMutationResult>;
```

### `src/lib/identity/errors.ts`

```ts
export class ModerationLockedError extends Error {
  readonly code = 'MODERATION_LOCKED';
  readonly httpStatus = 423;
  readonly reason: 'SUPPRESSED' | 'PAUSED' | 'REVIEW';
  constructor(reason: ModerationLockedError['reason'], message?: string);
}
export class StaleVersionError extends Error {
  readonly code = 'STALE_VERSION';
  readonly httpStatus = 409;
  readonly currentRowVersion: bigint;
}
export class AdvisoryLockContentionError extends Error {
  readonly code = 'ADVISORY_LOCK_CONTENTION';
  readonly httpStatus = 503;
}
```

### `src/lib/validation/category/schema.ts`

```ts
import { z } from 'zod';

export const RoomCategory = z.enum(['ENTIRE_PLACE', 'PRIVATE_ROOM', 'SHARED_ROOM']);
export type RoomCategory = z.infer<typeof RoomCategory>;

/** Discriminated union. Each variant enforces per-category required/forced-null rules from §6.6. */
export const InventoryInputSchema = z.discriminatedUnion('roomCategory', [
  EntirePlaceInputSchema,
  PrivateRoomInputSchema,
  SharedRoomInputSchema,
]);

export type InventoryInput = z.infer<typeof InventoryInputSchema>;
```

### `src/lib/validation/category/index.ts`

```ts
export interface ValidatedInventoryInput { /* normalized shape with forced-null columns set to NULL */ }

export function validateInventoryInput(
  raw: unknown
): { ok: true; value: ValidatedInventoryInput } | { ok: false; issues: z.ZodIssue[] };
```

### `src/lib/db/with-actor.ts`

```ts
import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type ActorRole = 'host' | 'moderator' | 'system';

/**
 * Run `fn` inside a SERIALIZABLE transaction with `app.actor_role` and `app.actor_id` GUCs set.
 * The moderation-precedence trigger reads these; missing values are treated as 'system'.
 */
export async function withActor<T>(
  actor: { role: ActorRole; id: string | null },
  fn: (tx: TransactionClient) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel; timeoutMs?: number }
): Promise<T>;
```

### `src/lib/db/optimistic-lock.ts`

```ts
/**
 * Compare the caller-supplied If-Match (or the implicit `row_version` read before the write)
 * to the current row. Throws StaleVersionError on mismatch.
 */
export function requireRowVersion(
  currentRowVersion: bigint,
  ifMatchRowVersion: bigint | null
): void;
```

### `src/lib/outbox/append.ts`

```ts
export type OutboxAggregateType = 'PHYSICAL_UNIT' | 'LISTING_INVENTORY' | 'HOST_UNIT_CLAIM' | 'IDENTITY_MUTATION';
export type OutboxKind = 'UNIT_UPSERTED' | 'INVENTORY_UPSERTED' | 'IDENTITY_MUTATION' | 'TOMBSTONE';

export interface AppendOutboxInput {
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;       // redacted by caller; validated against a schema registry in Phase 02
  sourceVersion: bigint;
  unitIdentityEpoch: number;
  priority?: number;                      // 0 = highest; default 100
}

export async function appendOutboxEvent(
  tx: TransactionClient,
  input: AppendOutboxInput
): Promise<{ outboxEventId: string }>;
```

### `src/lib/audit/events.ts`

```ts
export type AuditEventKind =
  | 'CANONICAL_UNIT_RESOLVED'
  | 'CANONICAL_UNIT_CREATED'
  | 'IDENTITY_MUTATION'
  | 'MODERATION_LOCKED_REJECTED'
  | 'HOST_CLAIM_UPSERTED'
  | 'INVENTORY_UPSERTED';

export interface AuditEventInput {
  kind: AuditEventKind;
  actor: { role: 'host' | 'moderator' | 'system'; id: string | null };
  aggregateType: 'physical_units' | 'host_unit_claims' | 'listing_inventories' | 'identity_mutations';
  aggregateId: string;
  details?: Record<string, string | number | boolean | null>;  // allowlist: no PII-bearing fields
  requestId?: string;
  unitIdentityEpoch?: number;
}

export async function recordAuditEvent(
  tx: TransactionClient,
  input: AuditEventInput
): Promise<{ auditEventId: string }>;
```

### `src/lib/flags/phase01.ts`

```ts
export function isPhase01CanonicalWritesEnabled(): boolean;

export const PHASE01_KILL_SWITCHES = {
  disable_new_publication: false,
  pause_identity_reconcile: false,
} as const;

export type Phase01KillSwitch = keyof typeof PHASE01_KILL_SWITCHES;

/** Phase 01 stub: always false. Real enforcement lands in Phase 02+. */
export function isKillSwitchActive(name: Phase01KillSwitch): boolean;
```

### `src/lib/idempotency.ts` (modification)

```ts
// Appended to the bottom of the file (no other changes):
export const IDEMPOTENCY_ENDPOINT_RESOLVE_UNIT = 'identity:resolveOrCreateUnit' as const;
export const IDEMPOTENCY_ENDPOINT_MUTATE_UNIT  = 'identity:mutateUnit' as const;
export const IDEMPOTENCY_ENDPOINT_CONTACT      = 'identity:contact' as const; // Phase 06 caller; declared now for stable endpoint name
```

### SQL / migration DDL summary (statement-level)

**`20260501000000_phase01_canonical_identity_tables/migration.sql`**

1. `CREATE TABLE "physical_units"` — columns: `id TEXT PK`, `unit_identity_epoch INTEGER NOT NULL DEFAULT 1`, `canonical_address_hash TEXT NOT NULL`, `canonical_unit TEXT NOT NULL DEFAULT '_none_'`, `canonicalizer_version TEXT NOT NULL`, `privacy_version INTEGER NOT NULL DEFAULT 1`, `geocode_status TEXT NOT NULL DEFAULT 'PENDING'`, `lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'`, `publish_status TEXT NOT NULL DEFAULT 'DRAFT'`, `supersedes_unit_ids TEXT[] NOT NULL DEFAULT '{}'`, `superseded_by_unit_id TEXT NULL`, `source_version BIGINT NOT NULL DEFAULT 1`, `row_version BIGINT NOT NULL DEFAULT 1`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
2. `CREATE UNIQUE INDEX "physical_units_canonical_unique_idx" ON "physical_units" (canonical_address_hash, canonical_unit);` — the §6.7 canonical unique index.
3. `CREATE INDEX ON "physical_units" (lifecycle_status);` and `(publish_status);`.
4. `CREATE TABLE "host_unit_claims"` — `id TEXT PK`, `unit_id TEXT NOT NULL REFERENCES "physical_units"(id)`, `host_user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE`, `claim_status TEXT NOT NULL DEFAULT 'UNVERIFIED'`, `unit_identity_epoch_written_at INTEGER NOT NULL`, `source_version BIGINT NOT NULL DEFAULT 1`, `row_version BIGINT NOT NULL DEFAULT 1`, `lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'`, `publish_status TEXT NOT NULL DEFAULT 'DRAFT'`, `privacy_version INTEGER NOT NULL DEFAULT 1`, `canonical_address_hash TEXT NOT NULL`, `canonicalizer_version TEXT NOT NULL`, `created_at/updated_at` same as above. `UNIQUE (unit_id, host_user_id)`.
5. `CREATE TABLE "listing_inventories"` — `id TEXT PK`, `unit_id TEXT NOT NULL REFERENCES "physical_units"(id)`, `unit_identity_epoch_written_at INTEGER NOT NULL`, `inventory_key TEXT NOT NULL`, `room_category TEXT NOT NULL CHECK (room_category IN ('ENTIRE_PLACE','PRIVATE_ROOM','SHARED_ROOM'))`, `space_label TEXT`, `capacity_guests INTEGER`, `total_beds INTEGER`, `open_beds INTEGER`, `available_from DATE NOT NULL`, `available_until DATE`, `availability_range TSTZRANGE NOT NULL`, `price NUMERIC(10,2) NOT NULL`, `lease_min_months INTEGER`, `lease_max_months INTEGER`, `lease_negotiable BOOLEAN NOT NULL DEFAULT FALSE`, `gender_preference TEXT`, `household_gender TEXT`, `lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE'`, `publish_status TEXT NOT NULL DEFAULT 'DRAFT'`, `source_version BIGINT NOT NULL DEFAULT 1`, `row_version BIGINT NOT NULL DEFAULT 1`, `last_published_version BIGINT`, `last_embedded_version TEXT`, `canonicalizer_version TEXT NOT NULL`, `canonical_address_hash TEXT NOT NULL`, `privacy_version INTEGER NOT NULL DEFAULT 1`, `supersedes_unit_ids TEXT[] NOT NULL DEFAULT '{}'`, `superseded_by_unit_id TEXT NULL`, `created_at/updated_at`.
6. Category-matrix CHECK constraints (three, `NOT VALID` then `VALIDATE`):
   - `inventory_category_entire_place_shape CHECK (room_category <> 'ENTIRE_PLACE' OR (capacity_guests IS NOT NULL AND total_beds IS NULL AND open_beds IS NULL AND gender_preference IS NULL AND household_gender IS NULL))`
   - `inventory_category_private_room_shape CHECK (room_category <> 'PRIVATE_ROOM' OR (capacity_guests IS NOT NULL AND total_beds IS NULL AND open_beds IS NULL))`
   - `inventory_category_shared_room_shape CHECK (room_category <> 'SHARED_ROOM' OR (total_beds IS NOT NULL AND open_beds IS NOT NULL AND open_beds <= total_beds AND capacity_guests IS NULL))`
7. `UNIQUE (unit_id, inventory_key)` on `listing_inventories`.
8. `CREATE TABLE "identity_mutations"` — `id TEXT PK`, `kind TEXT NOT NULL CHECK (kind IN ('MERGE','SPLIT','CANONICALIZER_UPGRADE','MANUAL_MODERATION'))`, `from_unit_ids TEXT[] NOT NULL`, `to_unit_ids TEXT[] NOT NULL`, `reason_code TEXT NOT NULL`, `operator_id TEXT NULL REFERENCES "User"(id) ON DELETE SET NULL`, `resulting_epoch INTEGER NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. **Append-only** — trigger in migration 2 rejects UPDATE and DELETE.
9. `CREATE TABLE "outbox_events"` — shape from (I). Indexes from (I).
10. `CREATE TABLE "cache_invalidations"` — shape from (H). Indexes from (H).
11. `CREATE TABLE "audit_events"` — `id TEXT PK`, `kind TEXT NOT NULL`, `actor_role TEXT NOT NULL`, `actor_id TEXT NULL`, `aggregate_type TEXT NOT NULL`, `aggregate_id TEXT NOT NULL`, `details JSONB NOT NULL DEFAULT '{}'::jsonb`, `request_id TEXT NULL`, `unit_identity_epoch INTEGER NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Indexes on `(aggregate_type, aggregate_id, created_at DESC)`, `(kind, created_at DESC)`, `(actor_id, created_at DESC)`. **Append-only** — trigger (below) rejects UPDATE and DELETE.
12. Rollback SQL (commented at end): `DROP TABLE … CASCADE` for all seven tables in reverse-dependency order.

**`20260501010000_phase01_moderation_precedence_trigger/migration.sql`**

1. `CREATE FUNCTION enforce_moderation_precedence() RETURNS TRIGGER LANGUAGE plpgsql AS $$ DECLARE role TEXT := current_setting('app.actor_role', true); BEGIN IF role IS NULL OR role = '' THEN role := 'system'; END IF; IF role = 'host' AND (NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status OR NEW.publish_status IS DISTINCT FROM OLD.publish_status OR NEW.privacy_version IS DISTINCT FROM OLD.privacy_version) THEN RAISE EXCEPTION USING MESSAGE = 'MODERATION_LOCKED: host may not modify moderation columns', ERRCODE = 'P0001', HINT = 'moderation'; END IF; RETURN NEW; END; $$;`
2. `CREATE TRIGGER trg_modprec_physical_units BEFORE UPDATE ON "physical_units" FOR EACH ROW EXECUTE FUNCTION enforce_moderation_precedence();`
3. Same trigger on `host_unit_claims` and `listing_inventories`.
4. `CREATE FUNCTION forbid_update_delete() RETURNS TRIGGER … RAISE EXCEPTION … ;`
5. `CREATE TRIGGER` (BEFORE UPDATE OR DELETE) on `identity_mutations` and `audit_events`.
6. Pin trigger function to the app's schema: `ALTER FUNCTION enforce_moderation_precedence() SET search_path = public, pg_catalog;` (mitigates PG-version drift risk from phase block).
7. Rollback SQL (commented): `DROP TRIGGER …; DROP FUNCTION …;`.

**`20260501020000_phase01_add_listing_physical_unit_id/migration.sql`**

1. `ALTER TABLE "Listing" ADD COLUMN "physical_unit_id" TEXT NULL;`
2. No index, no FK, no backfill. Rollback: `ALTER TABLE "Listing" DROP COLUMN "physical_unit_id";`.

---

## Data Flow

### Sequence 1 — Create-or-resolve unit (host-originated)

```
HTTP layer (not added in Phase 01; illustrative caller)
   │
   ├─ withIdempotency(key, userId, IDEMPOTENCY_ENDPOINT_RESOLVE_UNIT, body, op)      [src/lib/idempotency.ts]
   │     │
   │     ├─ Opens SERIALIZABLE tx, claims IdempotencyKey row (INSERT … ON CONFLICT; FOR UPDATE)
   │     ├─ Hash verify → if cached, return cached
   │     └─ op(tx):
   │            │
   │            ├─ withActor({role:'host', id:userId}, tx, ...)                      [src/lib/db/with-actor.ts]
   │            │     ├─ SELECT set_config('app.actor_role','host',true)
   │            │     └─ SELECT set_config('app.actor_id',userId,true)
   │            │
   │            ├─ validateInventoryInput(body.inventory)                             [src/lib/validation/category/]
   │            │     └─ zod rejects on category-matrix violation BEFORE touching DB
   │            │
   │            ├─ canonicalizeAddress(body.address)                                  [src/lib/identity/canonical-address.ts]
   │            │     → { canonicalAddressHash, canonicalUnit, canonicalizerVersion }
   │            │
   │            ├─ acquireXactLock(tx, canonicalUnitLockKey(hash))                    [src/lib/identity/advisory-locks.ts]
   │            │     └─ SELECT pg_advisory_xact_lock(hashtext('p1:unit:<hash>'))
   │            │
   │            ├─ resolveOrCreateUnit(tx, ...)                                       [src/lib/identity/resolve-or-create-unit.ts]
   │            │     ├─ INSERT INTO physical_units … ON CONFLICT (canonical_address_hash,canonical_unit) DO UPDATE
   │            │     │     SET source_version = physical_units.source_version + 1,
   │            │     │         row_version    = physical_units.row_version    + 1,
   │            │     │         updated_at     = NOW()
   │            │     │     RETURNING id, unit_identity_epoch, (xmax = 0) AS created
   │            │     ├─ BEFORE UPDATE trigger: role='host'; OLD.publish_status=NEW.publish_status → trigger passes
   │            │     │     (Had the host attempted to set publish_status, trigger would RAISE → caught below)
   │            │     ├─ appendOutboxEvent(tx, {aggregateType:'PHYSICAL_UNIT', kind:'UNIT_UPSERTED', …, priority:100})
   │            │     └─ recordAuditEvent(tx, {kind: created ? 'CANONICAL_UNIT_CREATED' : 'CANONICAL_UNIT_RESOLVED'})
   │            │
   │            ├─ host_unit_claims upsert (same pattern, scoped to unit_id + host_user_id)
   │            │     ├─ appendOutboxEvent(…, kind:'UNIT_UPSERTED' for claim) — Phase 02 worker separates kinds
   │            │     └─ recordAuditEvent(…, kind:'HOST_CLAIM_UPSERTED')
   │            │
   │            ├─ listing_inventories upsert — category-matrix CHECK enforced at SQL boundary
   │            │     ├─ appendOutboxEvent(…, kind:'INVENTORY_UPSERTED')
   │            │     └─ recordAuditEvent(…, kind:'INVENTORY_UPSERTED')
   │            │
   │            └─ returns { unitId, unitIdentityEpoch, created, pendingProjections: ['PENDING_GEOCODE','PENDING_PROJECTION','PENDING_EMBEDDING'] }
   │
   └─ Commit. All seven row writes (3 canonical + 3 outbox + audit events) commit together OR not at all.
```

**Failure modes observed in this sequence**:

- `AdvisoryLockContentionError`: if `pg_advisory_xact_lock` does not return within the
  tx timeout, Prisma throws and the whole tx rolls back.
- `MODERATION_LOCKED` from trigger: the SQL `RAISE` turns into a PG error; `withActor`
  translates to `ModerationLockedError` (→ 423 Locked at HTTP layer in Phase 02+).
- CHECK violation: zod catches most cases pre-commit; anything that slips through fails the
  `INSERT` and rolls back the full tx.

### Sequence 2 — Identity MERGE (N → 1)

```
Moderator operator tool (illustrative caller; not built in Phase 01)
   │
   ├─ withActor({role:'moderator', id:adminUserId}, tx, ...)
   │     │
   │     ├─ SELECT set_config('app.actor_role','moderator',true)
   │     │
   │     ├─ For each unitId in fromUnitIds:
   │     │     └─ acquireXactLock(tx, identityMutationLockKey(unitId))          // per-unit lock
   │     │
   │     ├─ recordIdentityMutation(tx, {kind:'MERGE', fromUnitIds:[A,B,C], toUnitIds:[T], reasonCode:'operator_duplicate'})
   │     │     │
   │     │     ├─ INSERT INTO identity_mutations(…) RETURNING id, resulting_epoch   // append-only trigger permits INSERT
   │     │     │
   │     │     ├─ UPDATE physical_units
   │     │     │     SET unit_identity_epoch = unit_identity_epoch + 1,
   │     │     │         superseded_by_unit_id = 'T',
   │     │     │         row_version = row_version + 1
   │     │     │   WHERE id = ANY(ARRAY['A','B','C'])
   │     │     │   // BEFORE UPDATE trigger sees role='moderator'; publish_status is NOT touched; passes.
   │     │     │
   │     │     ├─ UPDATE physical_units
   │     │     │     SET unit_identity_epoch = unit_identity_epoch + 1,
   │     │     │         supersedes_unit_ids = supersedes_unit_ids || ARRAY['A','B','C'],
   │     │     │         row_version = row_version + 1
   │     │     │   WHERE id = 'T'
   │     │     │
   │     │     ├─ appendOutboxEvent(tx, {aggregateType:'IDENTITY_MUTATION', aggregateId: mutationId,
   │     │     │                         kind:'IDENTITY_MUTATION', priority:0 /*highest*/, … })
   │     │     │
   │     │     └─ recordAuditEvent(tx, {kind:'IDENTITY_MUTATION', aggregateType:'identity_mutations', aggregateId:mutationId})
   │     │
   │     └─ returns { mutationId, resultingEpoch, affectedUnitIds:['A','B','C','T'] }
   │
   └─ Commit. Phase 01 does NOT run the reconciler — no downstream rewrites occur yet.
     (Phase 02+ adds the consumer that drains the outbox event and rewrites `contact_consumption`,
     `saved_listings`, etc. Those tables are not present in Phase 01 anyway.)
```

---

## Test Plan

### Acceptance-criterion → test mapping

**AC 1 — Migration applies cleanly on empty DB; reverse plan documented.**

- **T1.1** `src/__tests__/db/phase01-schema.test.ts::migration applies and creates 7 tables`
  — Uses `prisma migrate reset --force` in Jest global setup; asserts `information_schema.tables`
  contains all seven phase-01 tables.
- **T1.2** `src/__tests__/db/phase01-schema.test.ts::all indexes present` — asserts
  `physical_units_canonical_unique_idx` and the four required operational indexes exist.
- **T1.3** Manual/doc check: each migration README.md has a "Rollback" heading (checked by
  `src/__tests__/integration/phase01-schema-doc-presence.test.ts` that greps the repo).

**AC 2 — Invalid row shapes reject at the DB boundary.**

- **T2.1** `phase01-schema.test.ts::ENTIRE_PLACE rejects non-null total_beds`
- **T2.2** `phase01-schema.test.ts::SHARED_ROOM rejects null open_beds`
- **T2.3** `phase01-schema.test.ts::PRIVATE_ROOM rejects non-null total_beds`
- **T2.4** `phase01-schema.test.ts::SHARED_ROOM rejects open_beds > total_beds`
- **T2.5** `phase01-schema.test.ts::ENTIRE_PLACE rejects non-null gender_preference`
- **T2.6** `phase01-schema.test.ts::ENTIRE_PLACE accepts capacity_guests + null nulls`
- **T2.7** `schema.test.ts::zod rejects ENTIRE_PLACE with total_beds` — verifies the zod
  validator rejects before the DB is even touched.

**AC 3 — Moderation-precedence trigger rejects host-role UPDATE.**

- **T3.1** `phase01-moderation-precedence.test.ts::host role cannot set publish_status`
  — `withActor({role:'host'}, tx, async (tx) => { UPDATE physical_units SET publish_status='PUBLISHED' … })`
  → expects trigger `RAISE` → asserts error is `ModerationLockedError`.
- **T3.2** `phase01-moderation-precedence.test.ts::host role cannot set lifecycle_status`
- **T3.3** `phase01-moderation-precedence.test.ts::host role cannot set privacy_version`
- **T3.4** `phase01-moderation-precedence.test.ts::moderator role CAN set publish_status`
- **T3.5** `phase01-moderation-precedence.test.ts::missing actor_role defaults to system and passes`
- **T3.6** `phase01-moderation-precedence.test.ts::trigger applies to all three canonical tables`
- **T3.7** `phase01-moderation-precedence.test.ts::identity_mutations rejects UPDATE`
- **T3.8** `phase01-moderation-precedence.test.ts::audit_events rejects UPDATE`

**AC 4 — Canonical-unit uniqueness across whitespace/casing/empty-unit variants.**

- **T4.1** `canonical-address.test.ts::variants collapse to same hash`
  — 5 variants: `"123 Main St Apt 4B"`, `"  123  main  st  apt 4B "`, `"123 MAIN ST APT 4B"`,
  `"123 Main St. Apt 4B"`, `"123 Main Street Apt 4B"` — all produce same hash (modulo
  documented canonicalizer rules; test pins rules).
- **T4.2** `canonical-address.test.ts::empty unit vs "null" vs null collapse to "_none_"`
- **T4.3** `phase01-schema.test.ts::resolve-or-create yields ONE row for 5 variants`
  — Uses `resolveOrCreateUnit` 5 times with the variants; asserts `physical_units` row count = 1.

**AC 5 — Advisory-lock serializes concurrent create-or-resolve.**

- **T5.1** `phase01-advisory-lock-contention.test.ts::10 parallel callers yield exactly one insert`
  — `Promise.all(Array.from({length:10}, () => withIdempotency(uniqueKey_i, …, resolveOrCreateUnit(…))))`
  with all 10 using the same address. Asserts `physical_units` row count = 1; asserts 9 calls
  return `created: false`.
- **T5.2** `advisory-locks.test.ts::canonicalUnitLockKey is deterministic across whitespace variants`
- **T5.3** `advisory-locks.test.ts::key prefix matches LOCK_PREFIX_CANONICAL_UNIT`

**AC 6 — `identity_mutations` ledger + outbox emission in same tx.**

- **T6.1** `phase01-identity-mutation.test.ts::MERGE records ledger row and outbox event atomically`
  — Simulates a failure after the ledger insert but before outbox append; asserts BOTH
  are absent after rollback.
- **T6.2** `phase01-identity-mutation.test.ts::SPLIT supports multiple to_unit_ids`
- **T6.3** `phase01-identity-mutation.test.ts::CANONICALIZER_UPGRADE supports operator_id = null`
- **T6.4** `phase01-identity-mutation.test.ts::outbox event carries priority=0 for identity mutations`
- **T6.5** `mutate-unit.test.ts::bumps unit_identity_epoch on all affected units`

**AC 7 — `source_version` / `row_version` increment on every UPDATE; stale If-Match → 409.**

- **T7.1** `phase01-schema.test.ts::upsert increments source_version`
  — Two sequential upserts; asserts `source_version` goes from 1 → 2.
- **T7.2** `phase01-schema.test.ts::upsert increments row_version`
- **T7.3** `optimistic-lock.test.ts::requireRowVersion throws StaleVersionError on mismatch`
- **T7.4** `optimistic-lock.test.ts::requireRowVersion is no-op on match`
- **T7.5** `optimistic-lock.test.ts::StaleVersionError has httpStatus 409`

**AC 8 — No read path references new tables.**

- **T8.1** `phase01-read-path-isolation.test.ts::no production code references listing_inventories`
  — Shells out `git grep "listing_inventories"` (and the Prisma model name
  `ListingInventory`); asserts all hits are inside `src/lib/identity/**`,
  `src/lib/outbox/**`, `src/lib/audit/**`, `src/lib/validation/category/**`,
  `src/__tests__/**`, `prisma/**`, or `.orchestrator/**`. NO hits in
  `src/app/**` or `src/components/**`.
- **T8.2** Same for `physical_units`, `host_unit_claims`, `identity_mutations`,
  `outbox_events`, `cache_invalidations`, `audit_events`.
- **T8.3** `phase01-read-path-isolation.test.ts::Listing.physical_unit_id has no readers`
  — Asserts no `src/app/` or `src/components/` file reads the new column.

**AC 9 — `pnpm lint` + `pnpm typecheck` + `pnpm test` pass; ≥90% coverage on new modules.**

- Jest coverage config already collects from `src/**/*.{ts,tsx}`. Test suite is expected to
  produce ≥ 90% statement coverage on `src/lib/identity/**`, `src/lib/validation/category/**`,
  `src/lib/db/**`, `src/lib/outbox/**`, `src/lib/audit/**`, `src/lib/flags/**`.
- CI verification: the Phase 01 PR template includes a screenshot/paste of the coverage
  summary as a checklist item.

**AC 10 — Flag defined; defaults false; no caller.**

- **T10.1** `phase01.test.ts::isPhase01CanonicalWritesEnabled defaults to false when env unset`
- **T10.2** `phase01.test.ts::reads process.env.FEATURE_PHASE01_CANONICAL_WRITES`
- **T10.3** `phase01.test.ts::PHASE01_KILL_SWITCHES has disable_new_publication and pause_identity_reconcile keys`
- **T10.4** `phase01.test.ts::isKillSwitchActive returns false for every key`
- **T10.5** `phase01-read-path-isolation.test.ts::flag has zero callers` —
  `git grep isPhase01CanonicalWritesEnabled` must return only the definition file and its test.

### Additional unit tests (beyond the 10 ACs)

- **UT-1** `canonical-address.test.ts::country defaults to US`
- **UT-2** `canonical-address.test.ts::state case-insensitive`
- **UT-3** `canonical-address.test.ts::zip+4 collapses to 5-digit zip`
- **UT-4** `canonical-address.test.ts::diacritics normalized (é → e)`
- **UT-5** `canonical-address.test.ts::output length always 32 chars (base64url SHA-256)`
- **UT-6** `with-actor.test.ts::actor_role GUC visible inside tx via current_setting`
- **UT-7** `with-actor.test.ts::GUC auto-reset outside tx`
- **UT-8** `with-actor.test.ts::rolled-back tx leaves no GUC residue`
- **UT-9** `append.test.ts::priority defaults to 100`
- **UT-10** `append.test.ts::aggregate_type enum rejects unknown value at zod layer`
- **UT-11** `events.test.ts::details blocks PII-like keys (email, phone, password)`
  — Zod allowlist test.
- **UT-12** `events.test.ts::kind must be in allowed enum`
- **UT-13** `schema.test.ts::availability_range tstzrange present and valid`
- **UT-14** `schema.test.ts::SHARED_ROOM with open_beds > total_beds rejected by zod`
- **UT-15** `idempotency.test.ts::IDEMPOTENCY_ENDPOINT_* constants exported` —
  trivial; guards against accidental rename.
- **UT-16** `canonicalizer-version.test.ts::isCurrentCanonicalizerVersion compares strict equality`

---

## Edge Cases

1. **Whitespace-only unit input** (`unit: "   "`) → collapses to `"_none_"`, same hash as
   `null` or `""`. Covered by T4.2.
2. **Simultaneous concurrent resolve** — 10 parallel callers → advisory lock serializes;
   9 see `created: false`. Covered by T5.1.
3. **Host role attempts to unsuppress by setting `lifecycle_status = 'ACTIVE'` on a
   `SUPPRESSED` row** — trigger rejects before UPDATE commits. Covered by T3.1–T3.3.
4. **Host writes without `withActor` wrapper** — falls back to `app.actor_role = 'system'`;
   moderation columns pass. This is the "escape hatch" case: enforced by code review /
   lint rule (not by the DB). Edge case is documented; Phase 01 accepts it because no
   production write path exists yet that skips `withActor`. A future lint rule (out of
   scope) should ban direct Prisma calls to the canonical tables outside `withActor`.
5. **Idempotency key replayed with different body** — `withIdempotency` returns
   `{success:false, status:400}` before any DB write. Existing behavior; no new test needed.
6. **MERGE with pre-existing collision** (target T already had a row referring to A in
   `supersedes_unit_ids`) — the append-only `identity_mutations` INSERT still succeeds;
   `supersedes_unit_ids` is a set-union UPDATE, so duplicates collapse at array-dedup.
   Test: `phase01-identity-mutation.test.ts::MERGE with duplicate supersedes array dedups`.
7. **SPLIT where one of the to_unit_ids does not yet exist** — Phase 01 does NOT create
   units on SPLIT; operator is expected to have created target units first. Input
   validation rejects unknown unit IDs: `mutate-unit.test.ts::SPLIT validates all
   to_unit_ids exist`.
8. **CANONICALIZER_UPGRADE during a concurrent MERGE on the same unit** — both callers
   acquire `identityMutationLockKey(unitId)`; second waits until first commits. Covered by
   `phase01-identity-mutation.test.ts::concurrent mutations on same unit are serialized`.
9. **Trigger failure on PG-version drift** — trigger uses only `plpgsql`, `current_setting`,
   and `IS DISTINCT FROM` — all stable since PG 12. Migration comment pins: "Tested on
   PG 14/15/16". If the comment is stale vs deployed PG version, migration review flags.
10. **Advisory-lock keyspace collision with `"sweeper-expire-holds"`, `"reconcile-slots"`,
    `"cron_freshness_reminders"`, `"cfm_freshness_reminders"`, `"cron_stale_auto_pause"`,
    `"search-alerts"`, `hashtext(userId)` from listings create** — Phase 01 uses the
    `"p1:"` prefix; grep-verified no existing key starts with it. False-positive
    `hashtext` collision possible but acceptable (worst case = false serialization, not
    correctness loss).
11. **SERIALIZABLE conflict on concurrent upserts** — the existing idempotency retry loop
    already retries up to 3× on SQLSTATE 40001. Test: `phase01-advisory-lock-contention.test.ts::SERIALIZABLE retry converges`.
12. **`unit_identity_epoch` overflow** — Postgres `INTEGER` range is ~2B; practically
    unbounded. Documented; no code change.
13. **`source_version` overflow** — `BIGINT` range is 9.2×10¹⁸; practically unbounded.
14. **Category-matrix CHECK bypass via PostgreSQL `UPDATE … SET room_category = …`** —
    Trigger passes (moderator can change category); but CHECK constraints are re-evaluated
    on UPDATE. Test: `phase01-schema.test.ts::UPDATE that would violate category matrix rejects`.
15. **Outbox-event insert fails (e.g., JSONB payload is malformed)** — whole transaction
    rolls back, including the canonical-table INSERT. Covered by T6.1.
16. **`audit_events` insert fails** — same as above: full-tx rollback. Audit is
    first-class, not best-effort.
17. **Very long canonical address** (pathological input) — canonicalizer output is fixed
    32 chars; input length bounded by Zod admission validator to 512 chars per field.
18. **NULL byte / control char in address input** — Zod admission rejects; canonicalizer
    strips to whitespace as a defense-in-depth measure.
19. **Clock skew between app servers during advisory lock** — advisory locks are
    transaction-scoped, not time-bounded. No impact.
20. **Migration replay on a DB that has Phase 02 tables already installed** — impossible by
    construction; Phase 02 migrations carry a later timestamp. If forced, `CREATE TABLE`
    fails fast with `relation already exists`. Documented in migration README.

---

## Rollback

Per (K): rollback is manual, migration-by-migration, via the rollback SQL comments.

### Sub-change 1: `20260501020000_phase01_add_listing_physical_unit_id`

**Forward**: `ALTER TABLE "Listing" ADD COLUMN "physical_unit_id" TEXT NULL;`
**Rollback**:

```sql
ALTER TABLE "Listing" DROP COLUMN "physical_unit_id";
```

Fully reversible. No data loss (column is nullable and empty in Phase 01).

### Sub-change 2: `20260501010000_phase01_moderation_precedence_trigger`

**Rollback** (run in one tx):

```sql
DROP TRIGGER IF EXISTS trg_modprec_physical_units ON "physical_units";
DROP TRIGGER IF EXISTS trg_modprec_host_unit_claims ON "host_unit_claims";
DROP TRIGGER IF EXISTS trg_modprec_listing_inventories ON "listing_inventories";
DROP TRIGGER IF EXISTS trg_append_only_identity_mutations ON "identity_mutations";
DROP TRIGGER IF EXISTS trg_append_only_audit_events ON "audit_events";
DROP FUNCTION IF EXISTS enforce_moderation_precedence();
DROP FUNCTION IF EXISTS forbid_update_delete();
```

Fully reversible. Existing rows remain untouched (triggers only fire on UPDATE/DELETE).

### Sub-change 3: `20260501000000_phase01_canonical_identity_tables`

**Rollback** (run in one tx, before rolling back sub-change 2):

```sql
DROP TABLE IF EXISTS "audit_events" CASCADE;
DROP TABLE IF EXISTS "cache_invalidations" CASCADE;
DROP TABLE IF EXISTS "outbox_events" CASCADE;
DROP TABLE IF EXISTS "identity_mutations" CASCADE;
DROP TABLE IF EXISTS "listing_inventories" CASCADE;
DROP TABLE IF EXISTS "host_unit_claims" CASCADE;
DROP TABLE IF EXISTS "physical_units" CASCADE;
```

Fully reversible pre-launch because all tables are empty. If production data has been
written into any of these tables between deploy and rollback decision, the CASCADE DROP
loses it — which is **acceptable per project memory**: pre-launch, all data is dummy, and
the seed script (`pnpm seed:e2e`) reconstitutes test fixtures. If Phase 02+ has deployed
worker code that consumes these tables, rollback MUST first revert Phase 02 (or at
minimum disable its workers via kill switch).

### Sub-change 4: Flag module + code

**Rollback**: `git revert` the commit adding `src/lib/flags/phase01.ts`, the `env.ts`
getter, the `src/lib/identity/`, `src/lib/validation/category/`, `src/lib/db/with-actor.ts`,
`src/lib/outbox/`, and `src/lib/audit/events.ts` modules. Since no caller exists, no
dependent revert is needed. Tests are removed along with the code.

### Sub-change 5: Prisma schema

**Rollback**: `git revert` the edit to `prisma/schema.prisma`, then run
`pnpm prisma generate` to regenerate the client without the new model types. The actual
DB rollback is handled by sub-changes 1–3 above; Prisma schema is a pure code concern.

### Order of operations

1. Revert code (sub-changes 4 + 5) first — removes all TS callers.
2. Revert sub-change 2 (drop triggers) — unblocks any incidental writes.
3. Revert sub-change 3 (drop tables) — final DDL cleanup.
4. Revert sub-change 1 (drop column on `Listing`) — last, because the column lives on an
   existing table and dropping it requires the app to not reference it.

Document this order in `.orchestrator/phases/phase-01-foundations-identity-lifecycle/rollback-runbook.md`
if Phase 01 ships; otherwise the migration READMEs are the authoritative source.
