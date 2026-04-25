# Phase 02 — Outbox Pipeline & Filter Projections (Spec)

Phase 02 turns Phase 01's durable `outbox_events` rows into idempotent, `source_version`-ordered
rebuilds of two new sanitized projection tables (`inventory_search_projection`,
`unit_public_projection`) and drives `cache_invalidations` fan-out. It introduces a worker
topology with three priority lanes (`publish_high`, `publish_normal`, `cache_invalidate`) plus a
geocode worker, wires the publish state machine from master-plan §9.4
(DRAFT→PENDING_GEOCODE→PENDING_PROJECTION→PENDING_EMBEDDING→PUBLISHED, plus
STALE_PUBLISHED/PAUSED/SUPPRESSED/ARCHIVED), emits `projection_lag_seconds` metrics, and routes
exhausted items to a DLQ with `attempt_count` + `dlq_reason`. Projection tables stay dark — the
public read path is untouched until Phase 10. Phase 01's `outbox_events` / `cache_invalidations` /
`audit_events` tables are reused as-is; no re-shaping of what Phase 01 shipped.

---

## Ambiguity resolutions

All resolutions cite the authoritative source — Phase 01 live code at `file:LINE`, master-plan
sections, or Phase 01 spec — and pick a conservative default when the spec is silent.

### (A) Worker trigger mechanism — Vercel cron path vs. standalone

**Answer: Vercel cron paths, fanned out from the existing `daily-maintenance` dispatcher — NOT a
new standalone process.**

Repo constraints: Hobby plan caps crons at 2 total (`vercel.json:2-12` already uses both:
`/api/cron/sweep-expired-holds` every 5 min, `/api/cron/daily-maintenance` every 15 min). Adding a
3rd cron route requires Pro. The existing pattern in
`src/app/api/cron/daily-maintenance/route.ts:1-80` fans out multiple sub-tasks behind one
cron fire via `runTask(...)` blocks with independent try/catch and Sentry tagging. Phase 02
adopts the same pattern:

- **Option adopted**: a new file `src/app/api/cron/outbox-drain/route.ts` that is *internally*
  invoked from `daily-maintenance` on every tick (every 15 min) **and** from
  `sweep-expired-holds` on a 5-min cadence (every 5 min, so `publish_high` tombstones observe
  the 60 s hide SLO §18.1 worst-case at 5 min; post-launch Pro-plan upgrade adds a dedicated
  1-minute cron — flagged, see `deferred` below).
- **Auth**: reuses `validateCronAuth()` (`src/lib/cron-auth.ts:19`), the existing
  `Bearer ${CRON_SECRET}` pattern.
- **Per-tick semantics**: the route drains up to `MAX_BATCH=50` outbox rows per priority lane
  with `SKIP LOCKED`, time-boxed at `MAX_TICK_MS=9000` (Vercel Hobby function timeout is 10 s —
  `src/app/api/cron/daily-maintenance/route.ts` runs well inside that). After the time box the
  route returns; next tick resumes.
- **Internal drain helper is also exported** (`drainOutboxOnce(opts)`) so Phase 02 tests and any
  future long-running worker process can call it directly without going through HTTP.

**Risk flag**: the master plan §14 assumes a real worker pool with concurrency caps. This phase
intentionally delivers a cron-driven serial drain as the Phase 02 MVP; the spec documents (in
§Edge Cases 18) that tight SLOs (§18.1: p99 projection_lag < 60 s) will require Pro-plan crons
(1-minute) or a background-worker service before production launch. That upgrade is **out of
scope for Phase 02** — Phase 02 proves correctness and idempotency; the delivery cadence hardening
is a Phase 10 (launch hardening) deliverable.

### (B) Queue schema — single `outbox_events` with `priority` column, or multiple tables?

**Answer: single `outbox_events` table with a `priority` column — matches what Phase 01 shipped;
NO new queue tables.**

Phase 01 `outbox_events` already carries `priority SMALLINT NOT NULL DEFAULT 100`
(`prisma/migrations/20260501000000_phase01_canonical_identity_tables/migration.sql:164-180`) and
a partial index `outbox_events_pending_idx` on `(status, priority, next_attempt_at) WHERE status
IN ('PENDING','IN_FLIGHT')` (line 182-184). The three logical "queues" in scope (§14,
`publish_high` / `publish_normal` / `cache_invalidate`) are virtual priority bands over the same
table:

| Logical queue        | `priority` value | `kind` filter |
| -------------------- | ---------------- | ------------- |
| `publish_high`       | 0                | `TOMBSTONE`, `IDENTITY_MUTATION`, `SUPPRESSION`, `PAUSE` |
| `cache_invalidate`   | 10               | `CACHE_INVALIDATE` (new kind, Phase 02) |
| `publish_normal`     | 100 (default)    | `UNIT_UPSERTED`, `INVENTORY_UPSERTED`, `HOST_CLAIM_UPSERTED`, `GEOCODE_NEEDED` |

Phase 02 adds four new `OutboxKind` enum values (`CACHE_INVALIDATE`, `SUPPRESSION`, `PAUSE`,
`GEOCODE_NEEDED`) to the zod enum in `src/lib/outbox/append.ts:12-17`. No migration needed —
`kind` is `TEXT` at the DB boundary.

### (C) `SKIP LOCKED` polling — does indexing support it?

**Answer: YES — the existing partial index `outbox_events_pending_idx` on
`(status, priority, next_attempt_at) WHERE status IN ('PENDING','IN_FLIGHT')` is shaped exactly
for `SKIP LOCKED` polling.** Worker query shape:

```sql
SELECT id FROM outbox_events
WHERE status = 'PENDING'
  AND priority <= $1
  AND next_attempt_at <= NOW()
ORDER BY priority ASC, next_attempt_at ASC
LIMIT $2
FOR UPDATE SKIP LOCKED
```

The worker then UPDATEs each claimed row to `status='IN_FLIGHT'` in the same tx, commits the
claim, and processes outside the claim tx. Phase 01's partial index bounds the scan. This
matches `src/app/api/cron/sweep-expired-holds/route.ts` which uses the same `SKIP LOCKED`
pattern for `Booking` rows.

### (D) Stale `source_version` detection and skip

**Answer: detect at rebuild time by comparing event payload's `source_version` to the current
projection row's `source_version`.** Concretely:

1. `inventory_search_projection` and `unit_public_projection` both carry a `source_version BIGINT`
   column (new in Phase 02).
2. Projection rebuild does an UPSERT whose WHERE clause is
   `WHERE source_version <= EXCLUDED.source_version`, so an older event that arrives after a
   newer one updates zero rows. The worker observes `UPDATE 0` and marks the outbox row
   `status='COMPLETED'` with `dlq_reason=NULL` — NOT a DLQ (it is a no-op, not a failure).
3. Metric: `projection_stale_event_total{kind=…}` increments so operators can correlate DLQ-free
   "silent skips". See master-plan §18.2.

### (E) Publish status enum vs master-plan §9.4

**Answer: full §9.4 enum, persisted as `TEXT` with a CHECK constraint.** §9.4 lists:
`DRAFT | PENDING_GEOCODE | PENDING_PROJECTION | PENDING_EMBEDDING | PUBLISHED | STALE_PUBLISHED |
PAUSED | SUPPRESSED | ARCHIVED`. Phase 01 created `publish_status TEXT NOT NULL DEFAULT 'DRAFT'`
on `physical_units`, `host_unit_claims`, `listing_inventories` with **no CHECK constraint**
(`prisma/migrations/20260501000000_phase01_canonical_identity_tables/migration.sql:26, 53, 83`).
Phase 02 adds a CHECK constraint to `listing_inventories.publish_status` only (the status that
Phase 02 actually transitions):

```sql
ALTER TABLE "listing_inventories"
  ADD CONSTRAINT "listing_inventories_publish_status_chk"
  CHECK (publish_status IN ('DRAFT','PENDING_GEOCODE','PENDING_PROJECTION',
    'PENDING_EMBEDDING','PUBLISHED','STALE_PUBLISHED','PAUSED','SUPPRESSED','ARCHIVED'))
  NOT VALID;
ALTER TABLE "listing_inventories"
  VALIDATE CONSTRAINT "listing_inventories_publish_status_chk";
```

`physical_units.publish_status` gets the same CHECK **only if** Phase 02 worker ever transitions
it (currently no — Phase 02 only transitions `listing_inventories`; unit-level
`publish_status` stays `'DRAFT'` in this phase; Phase 03/04 may expand this).
`host_unit_claims.publish_status` is left unconstrained for the same reason.

### (F) `unit_public_projection` grouping SQL

**Answer: grouped aggregation keyed by `(unit_id, unit_identity_epoch)` over
`inventory_search_projection` rows filtered by `publish_status IN ('PUBLISHED','STALE_PUBLISHED')`**
(§6.4 + §10.3). Safe grouped fields per §10.3: `from_price`, `room_categories`,
`earliest_available_from`, `matching_inventory_count`, `coarse_availability_badges`. Rebuild SQL
sketch (illustrative only; actual worker builds this via a tx-local SELECT + UPSERT):

```sql
INSERT INTO unit_public_projection (unit_id, unit_identity_epoch, from_price,
  room_categories, earliest_available_from, matching_inventory_count, source_version, updated_at)
SELECT
  isp.unit_id,
  isp.unit_identity_epoch_written_at AS unit_identity_epoch,
  MIN(isp.price) AS from_price,
  array_agg(DISTINCT isp.room_category ORDER BY isp.room_category) AS room_categories,
  MIN(isp.available_from) AS earliest_available_from,
  COUNT(*)::int AS matching_inventory_count,
  MAX(isp.source_version) AS source_version,
  NOW() AS updated_at
FROM inventory_search_projection isp
WHERE isp.unit_id = $1
  AND isp.unit_identity_epoch_written_at = $2
  AND isp.publish_status IN ('PUBLISHED','STALE_PUBLISHED')
GROUP BY isp.unit_id, isp.unit_identity_epoch_written_at
ON CONFLICT (unit_id, unit_identity_epoch) DO UPDATE SET
  from_price = EXCLUDED.from_price,
  room_categories = EXCLUDED.room_categories,
  earliest_available_from = EXCLUDED.earliest_available_from,
  matching_inventory_count = EXCLUDED.matching_inventory_count,
  source_version = GREATEST(unit_public_projection.source_version, EXCLUDED.source_version),
  updated_at = NOW()
WHERE unit_public_projection.source_version <= EXCLUDED.source_version;
```

If `matching_inventory_count = 0` (all inventory tombstoned), the worker DELETEs the
`unit_public_projection` row instead of upserting (§9.3: "Tombstones fan out to
`unit_public_projection`, `inventory_search_projection`"). The grouping does NOT compute combined
gender/lease statements (§10.3: "Do not invent one combined 'spots available' or one combined
gender/lease statement across mixed inventory types").

### (G) Tombstone event kind enum

**Answer: reuse the existing `TOMBSTONE` kind from Phase 01's `OutboxKind` enum
(`src/lib/outbox/append.ts:12-17`), routed at `priority=0`.** Distinct from `SUPPRESSION` (also
`priority=0`) which carries a moderation-specific reason. Phase 02 adds to the enum:

- `TOMBSTONE` (already present) — inventory deleted/archived; fan out to
  inventory_search_projection DELETE + unit_public_projection regroup + cache_invalidations.
- `SUPPRESSION` (new) — moderator set `lifecycle_status='SUPPRESSED'`; same fan-out but records a
  different reason code in the cache_invalidations row.
- `PAUSE` (new) — host or moderator set `lifecycle_status='PAUSED'`; fan-out identical.
- `CACHE_INVALIDATE` (new) — the `priority=10` fan-out event the worker itself emits when
  republishing after a rebuild.
- `GEOCODE_NEEDED` (new) — a `priority=100` event emitted by the canonical-write path when a
  unit is newly created with `geocode_status='PENDING'`.

`UNIT_UPSERTED`, `INVENTORY_UPSERTED`, `IDENTITY_MUTATION` remain as Phase 01 shipped.

### (H) `cache_invalidations` shape reconciliation with Phase 01

**Answer: shape as-shipped, no schema change.** Phase 01 migration lines 193-209 gave us:
`id`, `unit_id`, `projection_epoch BIGINT`, `unit_identity_epoch INTEGER`, `reason TEXT`,
`enqueued_at`, `consumed_at`, `consumed_by`. Phase 02 populates rows with the following
discipline:

- `unit_id` — always present (tombstones keyed to unit per §10.5).
- `projection_epoch` — taken from the `projection_epoch` env constant (see (I) below) at enqueue
  time; workers that drain cache_invalidations set `consumed_at`/`consumed_by`.
- `reason` — one of `'TOMBSTONE' | 'SUPPRESSION' | 'PAUSE' | 'IDENTITY_MUTATION' | 'REPUBLISH'`
  (allowlist enforced in code, no DB CHECK added — consistent with Phase 01 philosophy that text
  enums carry app-level allowlists except for the publish state machine).

Phase 02 also adds a second partial index for backlog-age alerting:
```sql
CREATE INDEX cache_invalidations_pending_enqueued_idx
  ON cache_invalidations (enqueued_at)
  WHERE consumed_at IS NULL;
```
Phase 01 has `cache_invalidations_pending_idx ON (consumed_at) WHERE consumed_at IS NULL` (line
204-206), which is good for "any pending?" queries but not for "oldest pending" queries.

### (I) `projection_epoch` source

**Answer: a deploy-time monotonic env var `PROJECTION_EPOCH`, surfaced via a new module
`src/lib/projections/epoch.ts` that exports `currentProjectionEpoch()` as a bigint.** Rationale:

- Master plan §10.5 requires `projection_epoch` in every cacheable public response's ETag.
- The epoch must be monotonic across deploys and must bump when the projection schema or
  grouping rules change.
- Phase 02 does NOT yet serve public responses from the projection tables, so the epoch is
  only observed in `cache_invalidations.projection_epoch` and `outbox_events.payload.projection_epoch`.
- Storing it as an env var (`PROJECTION_EPOCH`, default `1`) matches the repo's flag idiom
  (`src/lib/env.ts:438-`). Incrementing requires a deploy — intentional friction.
- A fallback database row in a new 1-row table (`projection_epoch_state`) would be more
  correct for zero-downtime epoch bumps, but Phase 02 explicitly defers that until Phase 08
  (client cache coherence).

**Risk flag**: if two concurrent deploys disagree on `PROJECTION_EPOCH` during a rolling
deploy, cache_invalidations rows may carry mixed epochs for a 1-2 minute window. This is
documented as Edge Case 17 below and left as accepted risk.

### (J) Geocode worker dependency — adapter + error handling

**Answer: wrap the existing `geocodeAddress()` (`src/lib/geocoding.ts:10-31`) behind a new
`src/lib/projections/geocode-worker.ts` module.** Contract:

- Consumes outbox events of `kind='GEOCODE_NEEDED'` (`priority=100`).
- Calls `geocodeAddress(fullAddress)`; that function already wraps the Nominatim provider in a
  `circuitBreakers.nominatimGeocode` circuit and returns a tagged union
  `{status:'success' | 'not_found' | 'error'}`.
- On `success`: UPDATE `physical_units` SET `geocode_status='COMPLETE'`, `exact_point=POINT(lng,lat)`,
  `public_point=coarsened(lng,lat)`, `public_cell_id=...` in a `withActor({role:'system'})` tx;
  transition associated `listing_inventories.publish_status` from `PENDING_GEOCODE` →
  `PENDING_PROJECTION` (if inventory was previously created in `PENDING_GEOCODE` state);
  enqueue a new outbox event `INVENTORY_UPSERTED` to trigger projection rebuild.
- On `not_found`: UPDATE `physical_units.geocode_status='NOT_FOUND'`; listing stays in
  `PENDING_GEOCODE` permanently (no retry until human intervention); outbox row marked
  COMPLETED with a dlq_reason of NULL but a `last_error='not_found'`.
- On `error` or `CircuitOpenError`: outbox worker increments `attempt_count`, schedules
  `next_attempt_at = NOW() + 2^attempt * 30s + jitter` (bounded at 1 hour), up to
  `MAX_ATTEMPTS=8` (master-plan §14 "bounded retries with jitter for transient faults"). On
  `attempt_count >= MAX_ATTEMPTS`, move to DLQ with `dlq_reason='GEOCODE_EXHAUSTED'`.

Geocode column additions to `physical_units` (new Phase 02 migration):
- `exact_point GEOGRAPHY(Point, 4326) NULL` (requires `CREATE EXTENSION IF NOT EXISTS postgis`;
  **already present**: `prisma/migrations/20260314000000_add_pgvector_semantic_search/migration.sql`
  establishes PostGIS extension pattern — verify in preflight).
- `public_point GEOGRAPHY(Point, 4326) NULL`
- `public_cell_id TEXT NULL`
- `public_area_name TEXT NULL`

**Risk flag**: if PostGIS is NOT present in the test DB (PGlite does not ship with PostGIS),
geocode column types fall back to `TEXT NULL` storing the WKT representation. The spec
recommends gating the PostGIS columns behind a migration guard and using `TEXT` in the
PGlite-driven tests; production migrations add the GEOGRAPHY columns. Flagged as a real but
boundable ambiguity — Phase 02 test plan defers exact spatial correctness proofs (radius query,
density coarsening) to Phase 04 (search) / Phase 05 (privacy).

### (K) Metrics plumbing — Sentry + logger

**Answer: reuse the existing `logger.sync.*` + `@sentry/nextjs` surface as shown in
`src/app/api/cron/daily-maintenance/route.ts:32-34` — no new metrics library.** New module
`src/lib/metrics/projection-lag.ts` exports:

```ts
export function recordProjectionLag(kind: string, lagMs: number): void;
export function recordTombstoneHideLatency(unitId: string, lagMs: number): void;
export function recordDlqRouting(kind: string, reason: string): void;
export function recordStaleEventSkip(kind: string): void;
```

Each function emits:
1. A structured log entry via `logger.sync.info()` with `{ metric, value, kind, unit_id? }`.
2. A Sentry tag (`Sentry.setTag('metric.projection_lag_seconds', ...)`) for the enclosing
   request when invoked from a cron route.
3. Thresholds read from `src/lib/projections/alert-thresholds.ts` (new, constants only, no
   pager wiring — spec AC 7 says "alert threshold in config file (no pager wired yet)").

### (L) Feature flags for Phase 02

From master-plan §15 + phase-02 scope, Phase 02 introduces four flags (all default `false`
except the primary enablement which defaults `true` once Phase 02 lands but is gated by Phase
01's flag):

| Flag                                    | Purpose                                                       | Default |
| --------------------------------------- | ------------------------------------------------------------- | ------- |
| `phase02_projection_writes_enabled`     | Master gate — when false, cron drain is a no-op               | `false` |
| `disable_new_publication`               | Kill switch — canonical writes still save; projections pause  | `false` |
| `pause_geocode_publish`                 | Kill switch — listings stay PENDING_GEOCODE; geocode worker halts | `false` |
| `pause_backfills_and_repairs`           | Kill switch — stops low-priority repair/backfill work (for Phase 10 drills but declared here) | `false` |

All four live in a new module `src/lib/flags/phase02.ts` modeled after
`src/lib/flags/phase01.ts` (`src/lib/flags/phase01.ts:1-17`). Env-var reads through
`src/lib/env.ts`'s `features` object (getters appended, per Phase 01 pattern documented at
`phase-01-foundations-identity-lifecycle/spec.md` §J). Phase 01's stub kill switches
(`disable_new_publication`, `pause_identity_reconcile`) migrate from the stub-only
`PHASE01_KILL_SWITCHES` record into the real enforcement path in Phase 02 — `isKillSwitchActive`
now returns the live env-read value for `disable_new_publication`.

### (M) Column additions to `listing_inventories`

**Answer: NONE in Phase 02 beyond what Phase 01 already shipped.** Phase 01's
`listing_inventories` already carries:
- `source_version BIGINT NOT NULL DEFAULT 1` (line 84) — used for idempotent rebuild ordering.
- `last_published_version BIGINT NULL` (line 86) — Phase 02 writes this on successful
  `inventory_search_projection` upsert to record "the source_version we last successfully
  published".
- `last_embedded_version TEXT NULL` (line 87) — **stays untouched** in Phase 02; Phase 03
  populates it when the embedding worker lands.
- `publish_status TEXT` (line 83) — Phase 02 adds the CHECK constraint (see (E)) but does
  not add/rename columns.

Phase 02 DOES add the following columns to `physical_units` via a new migration:
`exact_point`, `public_point`, `public_cell_id`, `public_area_name` (see (J)). These are all
geocode-worker outputs, nullable, and safe to add without data-safety concerns
(pre-launch dummy data; empty tables — see project memory
`project_data_status.md`).

### (N) `phase02-read-path-isolation.test.ts` extension

**Answer: extend Phase 01's approach in
`src/__tests__/integration/phase01-read-path-isolation.test.ts` with two new enforced grep
patterns**:

1. No file under `src/app/` or `src/components/` imports `InventorySearchProjection` or
   `UnitPublicProjection` (new Prisma models).
2. No file under `src/app/search/**` or `src/lib/search/**` references the new projection
   table names (`inventory_search_projection`, `unit_public_projection`) — exclusions for
   `src/lib/projections/**`, `src/lib/outbox/**`, `src/__tests__/**`, `prisma/**`,
   `.orchestrator/**`.

Test file: `src/__tests__/integration/phase02-read-path-isolation.test.ts`. Mirrors the v3
Phase 01 approach (shell out to `git grep`, assert hits are whitelisted paths).

### (O) PGlite harness — reuse or fork?

**Answer: EXTEND `src/__tests__/utils/pglite-phase01.ts` into a new
`src/__tests__/utils/pglite-phase02.ts` that imports + re-exports from the Phase 01 file AND
applies Phase 02's new migrations on top.** Rationale:

- `src/__tests__/utils/pglite-phase01.ts` (987 lines) is large and field-complete for Phase 01.
- Forking would duplicate ~900 lines of Prisma-shaped adapter code.
- Phase 02 needs: (a) to apply Phase 02 migrations on top of Phase 01's, (b) to expose new
  `insertInventorySearchProjection`, `insertUnitPublicProjection`, `getOutboxEvents`
  (already present at line 914-934), plus helpers to claim/release outbox rows and count
  projection rows.
- Implementation pattern: `pglite-phase02.ts` calls `createPGliteFixture()` from the
  Phase 01 module, then applies Phase 02 migration SQL through the PGlite driver.

Specifically, Phase 02 also needs the PGlite harness to support `FOR UPDATE SKIP LOCKED`
semantics. PGlite 0.3+ is documented to support this (project memory does not conflict with
that claim; verified via the existing use in `pglite-phase01.ts` which relies on advisory
locks — but SKIP LOCKED fidelity remains a known limitation since PGlite is single-connection).
The `v3-review.json` already classifies multi-connection contention as DEFERRED; Phase 02
adopts the same stance: SKIP LOCKED tests assert the query is issued and the claimed rows
transition to `IN_FLIGHT`, but do NOT prove two concurrent workers race correctly. That proof
is deferred to Phase 10 with a Postgres testcontainer.

### (P) Tombstone fast-lane priority starvation test (PGlite)

**Answer: test passes if, under a workload of 100 `priority=100` pending events and 1
`priority=0` tombstone event appended afterward, the serial drain processes the tombstone
FIRST on the very next tick.** The PGlite single-connection limitation is not a problem here —
this test is about SQL ORDER BY, not concurrency.

Test pattern:
1. Seed 100 `priority=100` events with `status='PENDING'`, all `next_attempt_at <= NOW()`.
2. Append 1 `priority=0` TOMBSTONE event.
3. Call `drainOutboxOnce({ limit: 1 })`.
4. Assert exactly 1 row claimed; assert that row has `priority=0` and `kind='TOMBSTONE'`.
5. Assert 100 `priority=100` rows remain in `status='PENDING'`.

This proves fast-lane ordering holds under backlog. Covered by test case T4.1 below.

---

## Files & Changes

### DB / migrations (new files only)

1. `prisma/migrations/20260502000000_phase02_projection_tables/migration.sql`
   — `CREATE TABLE inventory_search_projection`, `CREATE TABLE unit_public_projection`,
   indexes for snapshot-friendly lookup by `(unit_id, unit_identity_epoch)` and
   `(publish_status, source_version)`. Includes rollback SQL block.
2. `prisma/migrations/20260502000000_phase02_projection_tables/README.md`
   — Data-safety notes (empty tables; no backfill); rollback (CASCADE DROP); lock footprint.
3. `prisma/migrations/20260502010000_phase02_physical_units_geocode_columns/migration.sql`
   — `ALTER TABLE physical_units` add `exact_point`, `public_point`, `public_cell_id`,
   `public_area_name`. Guards PostGIS with `CREATE EXTENSION IF NOT EXISTS postgis` wrapper and
   provides a `TEXT NULL` fallback for test environments. Rollback SQL comment.
4. `prisma/migrations/20260502010000_phase02_physical_units_geocode_columns/README.md`
5. `prisma/migrations/20260502020000_phase02_listing_inventories_publish_status_check/migration.sql`
   — Adds `listing_inventories_publish_status_chk` CHECK constraint per (E). `NOT VALID` then
   `VALIDATE CONSTRAINT`. Rollback: `DROP CONSTRAINT`.
6. `prisma/migrations/20260502020000_phase02_listing_inventories_publish_status_check/README.md`
7. `prisma/migrations/20260502030000_phase02_cache_invalidations_enqueued_idx/migration.sql`
   — `CREATE INDEX cache_invalidations_pending_enqueued_idx ON cache_invalidations
   (enqueued_at) WHERE consumed_at IS NULL`. Rollback: `DROP INDEX`.
8. `prisma/migrations/20260502030000_phase02_cache_invalidations_enqueued_idx/README.md`

### Prisma schema

9. `prisma/schema.prisma` — append two new models: `InventorySearchProjection` and
   `UnitPublicProjection`. Add four nullable fields to `PhysicalUnit`
   (`exactPoint`, `publicPoint`, `publicCellId`, `publicAreaName`). No behavioral readers of
   either added in Phase 02 (enforced by read-path isolation test — see (N)).

### `src/lib/projections/` (new)

10. `src/lib/projections/inventory-projection.ts` — `rebuildInventorySearchProjection(tx, {unitId,
    inventoryId, sourceVersion})`: idempotent UPSERT into `inventory_search_projection` with
    `source_version`-ordered WHERE clause. Returns `{updated: boolean, skippedStale: boolean}`.
11. `src/lib/projections/unit-projection.ts` — `rebuildUnitPublicProjection(tx, {unitId,
    unitIdentityEpoch})`: groups current published `inventory_search_projection` rows into one
    `unit_public_projection` row. DELETE on `matching_inventory_count=0`.
12. `src/lib/projections/tombstone.ts` — `handleTombstone(tx, {unitId, inventoryId, reason})`:
    DELETEs from both projections, enqueues a `cache_invalidations` row, emits a
    `CACHE_INVALIDATE` outbox event.
13. `src/lib/projections/geocode-worker.ts` — `handleGeocodeNeeded(tx, {outboxEvent})`: per (J).
    Wraps `geocodeAddress()`; on success, emits `INVENTORY_UPSERTED` events for any inventories
    currently in `PENDING_GEOCODE` on the affected unit.
14. `src/lib/projections/epoch.ts` — `currentProjectionEpoch(): bigint`. Reads
    `process.env.PROJECTION_EPOCH` (default `1n`).
15. `src/lib/projections/publish-states.ts` — const enum of all §9.4 statuses; type guard
    `isPublishedStatus(s)`; type guard `isHiddenStatus(s)` (PAUSED/SUPPRESSED/ARCHIVED).
16. `src/lib/projections/alert-thresholds.ts` — constants only:
    `PROJECTION_LAG_P99_SECONDS=60`, `TOMBSTONE_HIDE_SLA_SECONDS=60`,
    `CACHE_INVALIDATE_BACKLOG_SLA_SECONDS=120`.

### `src/lib/outbox/` (modifications + new)

17. `src/lib/outbox/append.ts` — extend the `OutboxKind` zod enum with `CACHE_INVALIDATE`,
    `SUPPRESSION`, `PAUSE`, `GEOCODE_NEEDED`. No behavioral change to existing callers.
18. `src/lib/outbox/drain.ts` (new) — `drainOutboxOnce({ maxBatch, maxTickMs, now? })`. Main
    dispatcher — claims up to `maxBatch` rows with `SKIP LOCKED`, routes by `kind`, handles
    retry + DLQ accounting, emits metrics. Returns `{ processed, dlq, staleSkipped,
    remainingByPriority }`.
19. `src/lib/outbox/handlers.ts` (new) — pure routing table from `OutboxKind` →
    `(tx, event) => Promise<HandlerResult>`. Each handler calls into `src/lib/projections/*`.
20. `src/lib/outbox/dlq.ts` (new) — `routeToDlq(tx, outboxEventId, reason)`: UPDATE row to
    `status='DLQ'`, set `dlq_reason`, persists.

### `src/app/api/cron/` (new + modification)

21. `src/app/api/cron/outbox-drain/route.ts` (new) — GET handler; `validateCronAuth`;
    internally calls `drainOutboxOnce({ maxBatch: 50, maxTickMs: 9000 })`; returns
    `{ processed, dlq, staleSkipped, remainingByPriority, elapsedMs }`. Does NOT run when
    `phase02_projection_writes_enabled === false` — returns `{ skipped: true }`.
22. `src/app/api/cron/daily-maintenance/route.ts` — add a new task `"outbox-drain"` that
    invokes the internal `drainOutboxOnce(...)` helper directly (not via HTTP) on every tick,
    mirroring the existing `refresh-dirty-search-docs` + `reconcile-slot-counts` pattern.
23. `src/app/api/cron/sweep-expired-holds/route.ts` — add a tail-call to
    `drainOutboxOnce({ maxBatch: 10, maxTickMs: 2000 })` for `priority=0` events only
    (argument: `priorityMax: 0`). Keeps the 5-min cadence fast-lane draining without needing a
    Pro-plan cron.

### `src/lib/metrics/` (new)

24. `src/lib/metrics/projection-lag.ts` — per (K).

### `src/lib/flags/` (new + modification)

25. `src/lib/flags/phase02.ts` (new) — `isPhase02ProjectionWritesEnabled()`,
    `PHASE02_KILL_SWITCHES = { disable_new_publication, pause_geocode_publish,
    pause_backfills_and_repairs }`, `isKillSwitchActive(name)`.
26. `src/lib/flags/phase01.ts` — no longer a stub for `disable_new_publication`;
    `isKillSwitchActive('disable_new_publication')` now reads the env-backed value.
    `pause_identity_reconcile` remains stub in Phase 02 (identity reconciler lands in Phase 04+).
27. `src/lib/env.ts` — append four getters to `features` object:
    `phase02ProjectionWrites`, `disableNewPublication`, `pauseGeocodePublish`,
    `pauseBackfillsAndRepairs`. Matches Phase 01 idiom (`src/lib/env.ts:574-`).

### `src/lib/identity/` (modification — thin)

28. `src/lib/identity/resolve-or-create-unit.ts` — on `created=true`, also append a
    `GEOCODE_NEEDED` outbox event at `priority=100` if `physical_units.geocode_status='PENDING'`.
    Nine-line change; Phase 01 test assertions hold (new event is ADDITIVE to the existing
    `UNIT_UPSERTED` append).

### Tests

Mirror source layout. Test files (selection; see Test Plan for full mapping):

29. `src/__tests__/utils/pglite-phase02.ts` — extends Phase 01 harness.
30. `src/__tests__/lib/projections/inventory-projection.test.ts`
31. `src/__tests__/lib/projections/unit-projection.test.ts`
32. `src/__tests__/lib/projections/tombstone.test.ts`
33. `src/__tests__/lib/projections/geocode-worker.test.ts`
34. `src/__tests__/lib/projections/epoch.test.ts`
35. `src/__tests__/lib/projections/publish-states.test.ts`
36. `src/__tests__/lib/outbox/drain.test.ts`
37. `src/__tests__/lib/outbox/handlers.test.ts`
38. `src/__tests__/lib/outbox/dlq.test.ts`
39. `src/__tests__/lib/metrics/projection-lag.test.ts`
40. `src/__tests__/lib/flags/phase02.test.ts`
41. `src/__tests__/db/phase02-schema.test.ts` — integration; applies Phase 02 migrations and
    asserts columns/constraints/indexes.
42. `src/__tests__/integration/phase02-outbox-to-projection.test.ts` — end-to-end: canonical
    write → outbox → drain → projections populated.
43. `src/__tests__/integration/phase02-tombstone-fast-lane.test.ts` — AC 4 / (P).
44. `src/__tests__/integration/phase02-geocode-pending.test.ts` — AC 5.
45. `src/__tests__/integration/phase02-source-version-ordering.test.ts` — AC 6.
46. `src/__tests__/integration/phase02-dlq-routing.test.ts` — AC 9.
47. `src/__tests__/integration/phase02-read-path-isolation.test.ts` — AC 8 / (N).
48. `src/__tests__/api/cron/outbox-drain.test.ts` — cron route auth + skip-when-disabled.

### Out of files & changes (explicit non-scope)

- NO semantic projection (`semantic_inventory_projection`) — Phase 03.
- NO query snapshots, no public read cutover — Phase 04 / Phase 10.
- NO client-cache push delivery — Phase 08.
- NO changes to `Booking`, `ListingDayInventory`, `Listing`, `Location`, `Conversation`,
  `Message`, `User`, `Account`, `SavedListing`, `SavedSearch`, `Report`, `Review`.
- NO Stripe / entitlement / paywall / payments — Phase 06.
- NO new public HTTP handler (only cron routes are added).
- NO `search_doc` changes (legacy search keeps its current index path).

---

## Function Signatures

### `src/lib/projections/epoch.ts`

```ts
/** Returns the deploy-time projection epoch; monotonic across deploys. */
export function currentProjectionEpoch(): bigint;

/** For tests only: overrides the env-derived value. */
export function __setProjectionEpochForTesting(value: bigint | null): void;
```

### `src/lib/projections/publish-states.ts`

```ts
export const PUBLISH_STATES = [
  'DRAFT', 'PENDING_GEOCODE', 'PENDING_PROJECTION', 'PENDING_EMBEDDING',
  'PUBLISHED', 'STALE_PUBLISHED', 'PAUSED', 'SUPPRESSED', 'ARCHIVED',
] as const;
export type PublishState = typeof PUBLISH_STATES[number];
export function isPublishedStatus(s: string): boolean;
export function isHiddenStatus(s: string): boolean;
export function isPendingStatus(s: string): boolean;
```

### `src/lib/projections/inventory-projection.ts`

```ts
export interface InventoryProjectionInput {
  unitId: string;
  inventoryId: string;
  sourceVersion: bigint;
  unitIdentityEpoch: number;
}
export interface InventoryProjectionResult {
  updated: boolean;
  skippedStale: boolean;
  targetStatus: PublishState;
}
export async function rebuildInventorySearchProjection(
  tx: TransactionClient,
  input: InventoryProjectionInput
): Promise<InventoryProjectionResult>;
```

### `src/lib/projections/unit-projection.ts`

```ts
export interface UnitProjectionResult {
  upserted: boolean;
  deleted: boolean;
  matchingInventoryCount: number;
  sourceVersion: bigint | null;
}
export async function rebuildUnitPublicProjection(
  tx: TransactionClient,
  unitId: string,
  unitIdentityEpoch: number
): Promise<UnitProjectionResult>;
```

### `src/lib/projections/tombstone.ts`

```ts
export type TombstoneReason = 'TOMBSTONE' | 'SUPPRESSION' | 'PAUSE' | 'ARCHIVE';
export interface TombstoneInput {
  unitId: string;
  inventoryId: string | null;
  reason: TombstoneReason;
  unitIdentityEpoch: number;
  sourceVersion: bigint;
}
export async function handleTombstone(
  tx: TransactionClient,
  input: TombstoneInput
): Promise<{ deletedInventoryRows: number; unitRowDeleted: boolean; cacheInvalidationId: string }>;
```

### `src/lib/projections/geocode-worker.ts`

```ts
export interface GeocodeOutboxEvent {
  id: string;
  aggregateType: 'PHYSICAL_UNIT';
  aggregateId: string;
  payload: { address: string; requestId: string | null };
  attemptCount: number;
}
export type GeocodeHandlerOutcome =
  | { status: 'success'; publishedStatus: 'PENDING_PROJECTION' }
  | { status: 'not_found' }
  | { status: 'transient_error'; retryAfterMs: number }
  | { status: 'exhausted'; dlqReason: 'GEOCODE_EXHAUSTED' };
export async function handleGeocodeNeeded(
  tx: TransactionClient,
  event: GeocodeOutboxEvent,
  deps?: { geocode?: typeof import('@/lib/geocoding').geocodeAddress }
): Promise<GeocodeHandlerOutcome>;
```

### `src/lib/outbox/drain.ts`

```ts
export interface DrainOptions {
  maxBatch?: number;
  maxTickMs?: number;
  priorityMax?: number;
  now?: () => Date;
}
export interface DrainResult {
  processed: number;
  completed: number;
  dlq: number;
  staleSkipped: number;
  retryScheduled: number;
  remainingByPriority: Record<number, number>;
  elapsedMs: number;
}
export async function drainOutboxOnce(opts?: DrainOptions): Promise<DrainResult>;
```

### `src/lib/outbox/handlers.ts`

```ts
export type HandlerResult =
  | { outcome: 'completed' }
  | { outcome: 'stale_skipped' }
  | { outcome: 'transient_error'; retryAfterMs: number; lastError: string }
  | { outcome: 'fatal_error'; dlqReason: string; lastError: string };
export type OutboxHandler = (tx: TransactionClient, event: OutboxRow) => Promise<HandlerResult>;
export const HANDLERS: Record<OutboxKind, OutboxHandler>;
```

### `src/lib/outbox/dlq.ts`

```ts
export async function routeToDlq(
  tx: TransactionClient,
  outboxEventId: string,
  reason: string,
  lastError: string
): Promise<void>;
```

### `src/lib/outbox/append.ts` (enum extension only)

```ts
export type OutboxKind =
  | 'UNIT_UPSERTED' | 'INVENTORY_UPSERTED' | 'IDENTITY_MUTATION' | 'TOMBSTONE'
  | 'CACHE_INVALIDATE' | 'SUPPRESSION' | 'PAUSE' | 'GEOCODE_NEEDED';
```

### `src/lib/metrics/projection-lag.ts`

```ts
export function recordProjectionLag(kind: string, lagMs: number): void;
export function recordTombstoneHideLatency(unitId: string, lagMs: number): void;
export function recordDlqRouting(kind: string, reason: string): void;
export function recordStaleEventSkip(kind: string): void;
export function recordBacklogDepth(priority: number, depth: number): void;
```

### `src/lib/flags/phase02.ts`

```ts
export function isPhase02ProjectionWritesEnabled(): boolean;
export const PHASE02_KILL_SWITCHES = {
  disable_new_publication: false,
  pause_geocode_publish: false,
  pause_backfills_and_repairs: false,
} as const;
export type Phase02KillSwitch = keyof typeof PHASE02_KILL_SWITCHES;
export function isKillSwitchActive(name: Phase02KillSwitch): boolean;
```

### Migration DDL summary (statement-level)

**`20260502000000_phase02_projection_tables/migration.sql`**

1. `CREATE TABLE "inventory_search_projection"` — columns: `id TEXT PK`,
   `inventory_id TEXT NOT NULL`, `unit_id TEXT NOT NULL`,
   `unit_identity_epoch_written_at INTEGER NOT NULL`,
   `room_category TEXT NOT NULL`, `capacity_guests INTEGER NULL`,
   `total_beds INTEGER NULL`, `open_beds INTEGER NULL`,
   `price NUMERIC(10,2) NOT NULL`, `available_from DATE NOT NULL`,
   `available_until DATE NULL`, `availability_range TSTZRANGE NOT NULL`,
   `lease_min_months INTEGER NULL`, `lease_max_months INTEGER NULL`,
   `lease_negotiable BOOLEAN NOT NULL DEFAULT FALSE`,
   `gender_preference TEXT NULL`, `household_gender TEXT NULL`,
   `public_point TEXT NULL`, `public_cell_id TEXT NULL`,
   `public_area_name TEXT NULL`,
   `publish_status TEXT NOT NULL DEFAULT 'PENDING_PROJECTION'`,
   `source_version BIGINT NOT NULL`, `projection_epoch BIGINT NOT NULL`,
   `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
   `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
2. `CREATE UNIQUE INDEX inventory_search_projection_inventory_unique_idx ON
   inventory_search_projection (inventory_id)`.
3. `CREATE INDEX ON inventory_search_projection (unit_id, unit_identity_epoch_written_at,
   publish_status)`.
4. `CREATE INDEX ON inventory_search_projection (publish_status, source_version)` — supports
   idempotent rebuild WHERE clause.
5. `CREATE TABLE "unit_public_projection"` — columns: `unit_id TEXT NOT NULL`,
   `unit_identity_epoch INTEGER NOT NULL`, `from_price NUMERIC(10,2) NULL`,
   `room_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
   `earliest_available_from DATE NULL`, `matching_inventory_count INTEGER NOT NULL DEFAULT 0`,
   `coarse_availability_badges TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
   `source_version BIGINT NOT NULL`, `projection_epoch BIGINT NOT NULL`,
   `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
   `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
6. `CREATE UNIQUE INDEX ON unit_public_projection (unit_id, unit_identity_epoch)` — primary
   lookup key.
7. `ALTER TABLE inventory_search_projection ADD CONSTRAINT
   inventory_search_projection_publish_status_chk CHECK (publish_status IN (...)) NOT VALID;
   VALIDATE CONSTRAINT`.
8. Rollback SQL (commented): `DROP TABLE unit_public_projection CASCADE; DROP TABLE
   inventory_search_projection CASCADE;`.

**`20260502010000_phase02_physical_units_geocode_columns/migration.sql`**

1. `CREATE EXTENSION IF NOT EXISTS postgis` (guarded; no-op on PGlite which skips the extension).
2. `ALTER TABLE physical_units ADD COLUMN exact_point GEOGRAPHY(Point, 4326) NULL` — with a
   DO $$ guard that falls back to `TEXT NULL` if the `geography` type is not available.
3. Same pattern for `public_point`.
4. `ALTER TABLE physical_units ADD COLUMN public_cell_id TEXT NULL`.
5. `ALTER TABLE physical_units ADD COLUMN public_area_name TEXT NULL`.
6. Rollback: `ALTER TABLE physical_units DROP COLUMN ...` for all four.

**`20260502020000_phase02_listing_inventories_publish_status_check/migration.sql`**

1. `ALTER TABLE listing_inventories ADD CONSTRAINT listing_inventories_publish_status_chk CHECK
   (publish_status IN ('DRAFT','PENDING_GEOCODE','PENDING_PROJECTION','PENDING_EMBEDDING',
   'PUBLISHED','STALE_PUBLISHED','PAUSED','SUPPRESSED','ARCHIVED')) NOT VALID`.
2. `ALTER TABLE listing_inventories VALIDATE CONSTRAINT listing_inventories_publish_status_chk`.
3. Rollback: `ALTER TABLE listing_inventories DROP CONSTRAINT listing_inventories_publish_status_chk`.

**`20260502030000_phase02_cache_invalidations_enqueued_idx/migration.sql`**

1. `CREATE INDEX cache_invalidations_pending_enqueued_idx ON cache_invalidations (enqueued_at)
   WHERE consumed_at IS NULL`.
2. Rollback: `DROP INDEX cache_invalidations_pending_enqueued_idx`.

---

## Data Flow

### Sequence 1 — Canonical write → outbox → projection + cache row (happy path)

```
HTTP (canonical write caller; illustrative — no new HTTP handler in Phase 02)
  │
  ├─ withActor({role:'host', id:userId}, async tx => { ... })
  │     │
  │     ├─ resolveOrCreateUnit(tx, {address, actor, requestId})
  │     │     [src/lib/identity/resolve-or-create-unit.ts:41-117]
  │     │     ├─ INSERT INTO physical_units ... ON CONFLICT DO UPDATE (source_version +=1)
  │     │     ├─ appendOutboxEvent(tx, {kind:'UNIT_UPSERTED', priority:100, sourceVersion, ...})
  │     │     ├─ *** Phase 02 addition ***
  │     │     │   IF created AND geocode_status='PENDING':
  │     │     │     appendOutboxEvent(tx, {kind:'GEOCODE_NEEDED', priority:100,
  │     │     │                            sourceVersion, payload:{address: fullAddr}})
  │     │     └─ recordAuditEvent(tx, {kind:'CANONICAL_UNIT_CREATED'|'CANONICAL_UNIT_RESOLVED'})
  │     │
  │     ├─ upsert host_unit_claims + appendOutboxEvent(kind:'UNIT_UPSERTED' for claim)
  │     └─ upsert listing_inventories (publish_status='PENDING_GEOCODE' if geocode pending,
  │                                    else 'PENDING_PROJECTION')
  │         + appendOutboxEvent(kind:'INVENTORY_UPSERTED', priority:100, ...)
  │
  └─ Commit. Return {unitId, unitIdentityEpoch, pendingProjections:['PENDING_GEOCODE']}.

... (time passes) ...

Cron tick — /api/cron/outbox-drain (via daily-maintenance every 15 min OR sweep-expired-holds
every 5 min for priority=0 only)
  │
  ├─ validateCronAuth(request)              [src/lib/cron-auth.ts:19]
  ├─ IF !isPhase02ProjectionWritesEnabled() → return {skipped:true}
  ├─ IF isKillSwitchActive('disable_new_publication') → skip normal lane; still drain priority=0
  ├─ drainOutboxOnce({maxBatch:50, maxTickMs:9000, priorityMax:100})
  │     │
  │     ├─ BEGIN SERIALIZABLE
  │     │
  │     ├─ SELECT id FROM outbox_events
  │     │    WHERE status='PENDING' AND priority <= 100 AND next_attempt_at <= NOW()
  │     │    ORDER BY priority ASC, next_attempt_at ASC
  │     │    LIMIT 50 FOR UPDATE SKIP LOCKED
  │     │  (claim batch; typical: 1 priority=0 TOMBSTONE + 49 priority=100)
  │     │
  │     ├─ UPDATE outbox_events SET status='IN_FLIGHT', attempt_count=attempt_count+1
  │     │   WHERE id = ANY(claimedIds)
  │     ├─ COMMIT (claim tx)
  │     │
  │     ├─ FOR EACH claimed event (outside claim tx):
  │     │   ├─ handler = HANDLERS[event.kind]
  │     │   ├─ result = await withActor({role:'system'}, tx => handler(tx, event))
  │     │   │     │
  │     │   │     ├─ (event.kind='INVENTORY_UPSERTED')
  │     │   │     ├─ rebuildInventorySearchProjection(tx, {unitId, inventoryId, sourceVersion})
  │     │   │     │     ├─ UPSERT ... WHERE source_version <= EXCLUDED.source_version
  │     │   │     │     │   RETURNING xmax=0 AS inserted, source_version
  │     │   │     │     └─ IF updated: UPDATE listing_inventories SET
  │     │   │     │            publish_status='PUBLISHED',
  │     │   │     │            last_published_version = sourceVersion
  │     │   │     │
  │     │   │     ├─ rebuildUnitPublicProjection(tx, unitId, unitIdentityEpoch)
  │     │   │     │     ├─ SELECT grouped aggregates FROM inventory_search_projection
  │     │   │     │     ├─ UPSERT unit_public_projection WHERE source_version <= EXCLUDED
  │     │   │     │     └─ IF matching_inventory_count=0: DELETE
  │     │   │     │
  │     │   │     ├─ INSERT INTO cache_invalidations (unit_id, projection_epoch,
  │     │   │     │      unit_identity_epoch, reason='REPUBLISH')
  │     │   │     │
  │     │   │     └─ recordProjectionLag('INVENTORY_UPSERTED', NOW() - event.created_at)
  │     │   │
  │     │   ├─ IF result.outcome='completed' → UPDATE outbox_events SET status='COMPLETED'
  │     │   ├─ IF result.outcome='stale_skipped' → UPDATE status='COMPLETED',
  │     │   │     recordStaleEventSkip(kind)
  │     │   ├─ IF result.outcome='transient_error' AND attempt_count < MAX_ATTEMPTS →
  │     │   │     UPDATE status='PENDING', next_attempt_at = NOW() + backoff, last_error=...
  │     │   ├─ IF result.outcome='transient_error' AND attempt_count >= MAX_ATTEMPTS →
  │     │   │     routeToDlq(tx, id, 'MAX_ATTEMPTS_EXHAUSTED', lastError)
  │     │   └─ IF result.outcome='fatal_error' → routeToDlq(tx, id, result.dlqReason, lastError)
  │     │
  │     ├─ Check elapsedMs >= maxTickMs → break out of loop, return DrainResult
  │     └─ recordBacklogDepth(priority, count) for each of {0,10,100}
  │
  └─ return NextResponse.json(DrainResult)
```

### Sequence 2 — Tombstone fast lane drain

```
Moderator action (illustrative)
  │
  ├─ withActor({role:'moderator'}, tx => { ... })
  │   ├─ UPDATE listing_inventories SET lifecycle_status='SUPPRESSED',
  │   │      publish_status='SUPPRESSED', source_version += 1
  │   │   (BEFORE UPDATE trigger enforce_moderation_precedence allows — role='moderator')
  │   ├─ appendOutboxEvent(tx, {kind:'SUPPRESSION', priority:0,  // fast lane
  │   │                          aggregateType:'LISTING_INVENTORY', aggregateId:inventoryId,
  │   │                          sourceVersion, payload:{reason:'moderator_review'}})
  │   └─ recordAuditEvent(tx, {kind:'MODERATION_LOCKED_REJECTED' — NB: reuse existing kind
  │                            or Phase 02 adds 'SUPPRESSION_APPLIED'})
  │
... Cron tick (within 5 minutes due to sweep-expired-holds tail-call) ...
  │
  ├─ drainOutboxOnce({priorityMax: 0, maxBatch: 10, maxTickMs: 2000})
  │   │
  │   ├─ claims all priority=0 rows FIRST (SKIP LOCKED query with priorityMax=0)
  │   ├─ handlers.SUPPRESSION:
  │   │   ├─ handleTombstone(tx, {unitId, inventoryId, reason:'SUPPRESSION', ...})
  │   │   │    ├─ DELETE FROM inventory_search_projection WHERE inventory_id = $1
  │   │   │    ├─ rebuildUnitPublicProjection(tx, unitId, unitIdentityEpoch)
  │   │   │    │     → IF matching_inventory_count=0: DELETE FROM unit_public_projection
  │   │   │    ├─ INSERT INTO cache_invalidations (reason='SUPPRESSION', unit_id, projection_epoch)
  │   │   │    ├─ appendOutboxEvent(tx, {kind:'CACHE_INVALIDATE', priority:10, unit_id, ...})
  │   │   │    └─ recordTombstoneHideLatency(unitId, NOW() - event.created_at)
  │   │   └─ return {outcome:'completed'}
  │   │
  │   └─ UPDATE outbox_events SET status='COMPLETED' WHERE id IN (...)
```

### Sequence 3 — Geocode failure → PENDING_GEOCODE loop

```
GEOCODE_NEEDED event (priority=100) claimed by drainOutboxOnce
  │
  ├─ handlers.GEOCODE_NEEDED:
  │     │
  │     ├─ handleGeocodeNeeded(tx, event)
  │     │   ├─ result = await geocodeAddress(event.payload.address)
  │     │   │     [src/lib/geocoding.ts:10]
  │     │   │     └─ circuitBreakers.nominatimGeocode.run(...)
  │     │   │
  │     │   ├─ IF result.status='success':
  │     │   │     ├─ UPDATE physical_units SET geocode_status='COMPLETE', exact_point,
  │     │   │     │      public_point, public_cell_id, public_area_name,
  │     │   │     │      source_version += 1
  │     │   │     │   WHERE id = aggregateId
  │     │   │     ├─ UPDATE listing_inventories SET publish_status='PENDING_PROJECTION'
  │     │   │     │    WHERE unit_id = aggregateId AND publish_status='PENDING_GEOCODE'
  │     │   │     ├─ FOR EACH such inventory: appendOutboxEvent(tx,
  │     │   │     │                                              {kind:'INVENTORY_UPSERTED'})
  │     │   │     └─ return {outcome:'completed'}
  │     │   │
  │     │   ├─ IF result.status='not_found':
  │     │   │     ├─ UPDATE physical_units SET geocode_status='NOT_FOUND'
  │     │   │     │   (listing_inventories stays in PENDING_GEOCODE forever until manual fix)
  │     │   │     └─ return {outcome:'completed'}  // not a failure; terminal state
  │     │   │
  │     │   ├─ IF result.status='error' OR CircuitOpenError:
  │     │   │     ├─ IF attemptCount >= MAX_ATTEMPTS (default 8):
  │     │   │     │     → return {outcome:'fatal_error', dlqReason:'GEOCODE_EXHAUSTED'}
  │     │   │     └─ return {outcome:'transient_error',
  │     │   │                retryAfterMs: exponentialBackoff(attemptCount)}
  │     │   │
  │     │   └─ (drain.ts applies the outcome — UPDATE outbox_events accordingly)
```

The canonical write response has **already returned** `accepted_pending_publish` with
`pending_projections=['PENDING_GEOCODE']` at the time of the original write — geocode
processing never blocks the write path.

---

## Test Plan

### Acceptance-criterion → test mapping

**AC 1 — Canonical write appends exactly one outbox_events row in same tx.**

- **T1.1** `phase02-outbox-to-projection.test.ts::INVENTORY_UPSERTED append atomic with
  listing_inventory INSERT` — wraps an atomic write; asserts `outbox_events` row count goes
  from 0 to exactly 1 for that aggregate; asserts both committed together by intentionally
  throwing post-insert and observing both rolled back.
- **T1.2** `append.test.ts::INVENTORY_UPSERTED persists with priority=100 (default)`
- **T1.3** `phase02-outbox-to-projection.test.ts::GEOCODE_NEEDED emitted only when
  geocode_status=PENDING on create`
- **T1.4** `phase02-outbox-to-projection.test.ts::duplicate write appends TWO outbox rows
  (one per upsert)` — idempotent canonical write paths deduplicate at the
  `IdempotencyKey` layer; within a single tx only one outbox row per upsert.

**AC 2 — Worker rebuilds projections idempotently.**

- **T2.1** `inventory-projection.test.ts::same event processed twice → same projection row`
  — process event E1 (sv=5) twice; assert exactly one row in `inventory_search_projection`
  with `source_version=5`; assert second call returns `{updated:false, skippedStale:false}`
  (because source_version is equal; WHERE `source_version <= EXCLUDED`, but no real change so
  updated_at advances but row count unchanged).
- **T2.2** `inventory-projection.test.ts::processing different sv on same aggregate →
  last-writer-wins`
- **T2.3** `unit-projection.test.ts::grouped aggregates recompute deterministically on re-run`

**AC 3 — Tombstone arriving after publish purges rows + emits cache_invalidations.**

- **T3.1** `tombstone.test.ts::after publish, TOMBSTONE event deletes both projection rows`
  — seed published state, process TOMBSTONE, assert zero rows in either projection for that
  unit.
- **T3.2** `tombstone.test.ts::emits cache_invalidations row keyed to unit_id with
  reason=TOMBSTONE`
- **T3.3** `tombstone.test.ts::unit-level tombstone (inventoryId=null) cascades across all
  inventories in that unit`
- **T3.4** `tombstone.test.ts::projection_epoch on cache_invalidations row matches
  currentProjectionEpoch()`

**AC 4 — Tombstone fast lane bypasses normal queue.**

- **T4.1** `phase02-tombstone-fast-lane.test.ts::100 pending publish_normal + 1 publish_high
  → tombstone completes first` — per (P).
- **T4.2** `drain.test.ts::SKIP LOCKED SELECT ORDER BY priority ASC, next_attempt_at ASC
  enforces fast-lane ordering`
- **T4.3** `drain.test.ts::priorityMax=0 filters out normal-lane events within same tick`

**AC 5 — Geocode failure → PENDING_GEOCODE, write returns accepted_pending_publish.**

- **T5.1** `phase02-geocode-pending.test.ts::canonical write with PENDING geocode status sets
  listing_inventories.publish_status='PENDING_GEOCODE'`
- **T5.2** `geocode-worker.test.ts::result.status='error' leaves publish_status=PENDING_GEOCODE
  and schedules retry`
- **T5.3** `geocode-worker.test.ts::result.status='success' transitions to PENDING_PROJECTION
  and emits INVENTORY_UPSERTED event`
- **T5.4** `geocode-worker.test.ts::result.status='not_found' sets geocode_status=NOT_FOUND,
  outbox event marked COMPLETED (not DLQ)`
- **T5.5** `phase02-geocode-pending.test.ts::canonical write response carries
  pending_projections=['PENDING_GEOCODE']` (integration check through helper).

**AC 6 — Out-of-order events: old source_version does NOT overwrite.**

- **T6.1** `phase02-source-version-ordering.test.ts::sv=7 then sv=5 → projection row stays sv=7`
  — seed event E1 (sv=5) and E2 (sv=7); process E2 first, then E1; assert projection has sv=7
  and `recordStaleEventSkip` was called for E1.
- **T6.2** `inventory-projection.test.ts::skippedStale=true when source_version < existing`
- **T6.3** `phase02-source-version-ordering.test.ts::stale event marked COMPLETED, not DLQ`

**AC 7 — projection_lag_seconds metric emitted per rebuild; alert threshold in config.**

- **T7.1** `projection-lag.test.ts::recordProjectionLag emits log entry with lag in ms`
- **T7.2** `projection-lag.test.ts::records Sentry tag projection_lag_seconds`
- **T7.3** `alert-thresholds.test.ts::PROJECTION_LAG_P99_SECONDS=60` (master-plan §18.1).
- **T7.4** `phase02-outbox-to-projection.test.ts::after rebuild, recordProjectionLag was called`
  — spy pattern via jest mocks.

**AC 8 — No public read path references new projection tables.**

- **T8.1** `phase02-read-path-isolation.test.ts::git grep inventory_search_projection yields
  only projections/outbox/tests/prisma hits` — per (N).
- **T8.2** `phase02-read-path-isolation.test.ts::git grep unit_public_projection equivalent`
- **T8.3** `phase02-read-path-isolation.test.ts::no file in src/app/search/** references
  InventorySearchProjection or UnitPublicProjection Prisma model`
- **T8.4** `phase02-read-path-isolation.test.ts::no file in src/components/** references
  the new Prisma models`

**AC 9 — DLQ rows contain attempt_count + dlq_reason; routed after max_attempts.**

- **T9.1** `phase02-dlq-routing.test.ts::event failing transient_error 8 times routes to DLQ
  with reason=MAX_ATTEMPTS_EXHAUSTED and dlq_reason recorded`
- **T9.2** `dlq.test.ts::routeToDlq sets status=DLQ, dlq_reason, last_error`
- **T9.3** `phase02-dlq-routing.test.ts::GEOCODE_EXHAUSTED dlq_reason when geocode retries out`
- **T9.4** `phase02-dlq-routing.test.ts::attempt_count persists across retries and matches
  actual retry count in DLQ row`
- **T9.5** `drain.test.ts::recordDlqRouting metric fires on DLQ routing`

**AC 10 — pnpm lint + typecheck + test pass; integration test covers flow end-to-end with
PGlite.**

- **T10.1** `phase02-outbox-to-projection.test.ts::end-to-end via pglite-phase02 harness`
  — apply migrations; canonical write; assert outbox row; simulate cron fire via
  `drainOutboxOnce()`; assert projection rows present; assert cache_invalidations row present.
- Coverage gate: ≥90% statement coverage on `src/lib/projections/**`, `src/lib/outbox/**`,
  `src/lib/metrics/**` (matches Phase 01 precedent).
- Lint/typecheck: run in CI; no new lint warnings in new files.

### Additional unit tests (beyond ACs)

- **UT-1** `drain.test.ts::drain is a no-op when phase02_projection_writes_enabled=false`
- **UT-2** `drain.test.ts::drain skips normal lane when disable_new_publication kill switch on`
- **UT-3** `drain.test.ts::drain skips GEOCODE_NEEDED when pause_geocode_publish kill switch on`
- **UT-4** `drain.test.ts::exits early when maxTickMs elapsed mid-batch`
- **UT-5** `handlers.test.ts::every OutboxKind has a handler registered`
- **UT-6** `handlers.test.ts::unknown kind → routeToDlq with reason=UNKNOWN_KIND`
- **UT-7** `epoch.test.ts::currentProjectionEpoch defaults to 1n when PROJECTION_EPOCH unset`
- **UT-8** `epoch.test.ts::reads bigint from env string (e.g., '42' → 42n)`
- **UT-9** `publish-states.test.ts::isPublishedStatus returns true only for PUBLISHED and
  STALE_PUBLISHED`
- **UT-10** `publish-states.test.ts::isHiddenStatus covers PAUSED, SUPPRESSED, ARCHIVED`
- **UT-11** `phase02-schema.test.ts::CHECK constraint rejects listing_inventories.publish_status=
  'INVALID_STATE'`
- **UT-12** `phase02-schema.test.ts::unit_public_projection UNIQUE on (unit_id,
  unit_identity_epoch) rejects duplicate`
- **UT-13** `phase02-schema.test.ts::cache_invalidations_pending_enqueued_idx exists`
- **UT-14** `flags/phase02.test.ts::defaults false for all four flags`
- **UT-15** `flags/phase02.test.ts::reads FEATURE_PHASE02_PROJECTION_WRITES from env`
- **UT-16** `outbox-drain.test.ts::cron route returns 401 when Bearer token missing`
- **UT-17** `outbox-drain.test.ts::cron route returns {skipped:true} when flag disabled`

---

## Edge Cases

1. **Tombstone arrives before the aggregate's initial publish** (e.g., moderator suppresses a
   listing that never reached PUBLISHED) — tombstone handler DELETEs zero rows from
   `inventory_search_projection` (nothing there), DELETEs zero rows from
   `unit_public_projection`, still enqueues `cache_invalidations` (defensive — clients may have
   optimistic entries), returns `{outcome:'completed'}` with `recordTombstoneHideLatency=0`.
   Test: `tombstone.test.ts::handles tombstone before publish gracefully`.

2. **Event payload references an `inventoryId` that no longer exists** (deleted inventory in
   a later migration or manual cleanup) — handler DELETEs zero rows and returns
   `{outcome:'completed'}` with a structured log line, NOT a DLQ. Rationale: a missing
   aggregate is a no-op, not a fault. Test: `handlers.test.ts::missing aggregate → completed`.

3. **Same `source_version` processed twice** (duplicate delivery) — UPSERT WHERE clause
   `source_version <= EXCLUDED.source_version` evaluates true on equality; row is "updated"
   but no columns change except `updated_at`; `updated:true, skippedStale:false`. Test:
   `inventory-projection.test.ts::same sv → idempotent no-op update`.

4. **Geocode provider returns success on retry 3 of 8** — `handleGeocodeNeeded` observes
   success; previous outbox row attempt_count is 3; worker sets status=COMPLETED with
   `last_error` cleared. Test: `geocode-worker.test.ts::success on retry clears last_error`.

5. **Geocode circuit breaker is OPEN at claim time** — `circuitBreakers.nominatimGeocode`
   throws `CircuitOpenError` (from `src/lib/geocoding.ts:23`); handler treats as
   `transient_error` with `retryAfterMs=CIRCUIT_RETRY_MS` (default 60 s). Test:
   `geocode-worker.test.ts::CircuitOpenError → transient_error with 60s retry`.

6. **`pause_geocode_publish` kill switch enabled mid-drain** — handler checks flag before
   invoking `geocodeAddress()`; returns `{outcome:'transient_error', retryAfterMs:300000}`
   (5 min) without calling the provider. Outbox row stays PENDING. Test:
   `geocode-worker.test.ts::kill switch pauses without DLQ`.

7. **Concurrent drain from two cron fires** (e.g., `daily-maintenance` and
   `sweep-expired-holds` tail-call overlap) — `SKIP LOCKED` claim ensures each row is claimed
   by exactly one caller; the other caller's claim query skips locked rows. Test:
   `drain.test.ts::FOR UPDATE SKIP LOCKED is in the emitted SQL` (via query spy) — full
   multi-connection proof deferred to Phase 10 testcontainer (same posture as Phase 01 v3
   review).

8. **`cache_invalidations` consumer does not exist yet in Phase 02** — rows accumulate with
   `consumed_at=NULL`. Acceptable; Phase 08 adds the client-push consumer. Alert threshold
   `CACHE_INVALIDATE_BACKLOG_SLA_SECONDS=120` documented but NOT paging in Phase 02. Test:
   `alert-thresholds.test.ts::CACHE_INVALIDATE_BACKLOG_SLA_SECONDS=120`.

9. **Projection row exists but outbox event has stale sv** (replay after catch-up) — UPSERT
   WHERE clause rejects; `skippedStale=true`; `recordStaleEventSkip` increments; outbox row
   marked COMPLETED (NOT DLQ — this is expected behavior per §9.3). Test:
   `phase02-source-version-ordering.test.ts::replayed older event is COMPLETED, not DLQ`.

10. **`disable_new_publication` kill switch activated during a running drain tick** — the
    current tick finishes what it has claimed; subsequent ticks skip the normal-lane query.
    Fast-lane (priority=0) still drains — tombstones must not be starved by a kill switch
    (§15: "pauses projection pipeline" — which is NEW publishes, not tombstones). Test:
    `drain.test.ts::disable_new_publication only affects priority>0 events`.

11. **`CREATE EXTENSION postgis` fails** (insufficient DB privileges or extension unavailable)
    — migration falls through to `TEXT NULL` columns for `exact_point` / `public_point`.
    PGlite tests run without PostGIS. Production monitoring should assert the geography type
    is in place (not covered by Phase 02 tests; flagged for ops). Test:
    `phase02-schema.test.ts::geocode columns created (as either geography or text fallback)`.

12. **PGlite harness does not support `FOR UPDATE SKIP LOCKED` correctly** — if the feature is
    missing, tests that rely on it fall back to observing that the SQL string is emitted.
    Documented limitation identical to Phase 01's advisory-lock posture (`v3-review.json`
    line 7). Test: `drain.test.ts::emitted SQL contains 'FOR UPDATE SKIP LOCKED'`.

13. **Handler throws uncaught JS exception** (programmer error, not a database error) — drain
    catches, logs to Sentry via `sanitizeErrorMessage`, treats as `transient_error` with
    `retryAfterMs=60_000`. On `attempt_count >= MAX_ATTEMPTS`: DLQ with `dlq_reason=
    'UNCAUGHT_HANDLER_EXCEPTION'`. Test: `drain.test.ts::uncaught handler exception routed`.

14. **Drain exceeds `maxTickMs=9000`** — drain exits with partial `DrainResult`; unprocessed
    rows remain IN_FLIGHT with `next_attempt_at` unchanged. Risk: rows stuck in IN_FLIGHT if
    the drain fire dies mid-tick. Mitigation: a "stale IN_FLIGHT reaper" reverts rows whose
    `next_attempt_at + 10min` has elapsed to PENDING. Out of scope for Phase 02 MVP;
    deferred. Test: `drain.test.ts::exits cleanly on maxTickMs with unprocessed rows IN_FLIGHT`.

15. **`unit_identity_epoch` bumps between outbox event enqueue and drain** (merge happens
    concurrently) — the event carries the original epoch in `unit_identity_epoch`; handler
    uses that epoch to key the projection row. Subsequent identity mutation events drain
    afterwards and rebuild at the new epoch. Projections may briefly show the old epoch's
    row; Phase 04 (query snapshots) handles cross-epoch reconciliation. Test:
    `phase02-outbox-to-projection.test.ts::epoch bump mid-drain does not corrupt projection`.

16. **Single-category unit**: all inventories are ENTIRE_PLACE — `room_categories` array has
    exactly one element; `matching_inventory_count=1`; no "combined" semantics needed.
    Test: `unit-projection.test.ts::single-category unit groups cleanly`.

17. **Rolling deploy with mixed `PROJECTION_EPOCH` values across nodes** — cache_invalidations
    rows carry mixed epochs for a 1-2 minute window. Clients reject rows with older epochs
    once the newer-epoch response arrives. No data loss, just brief cache churn. Documented
    acceptable risk; not tested in Phase 02 (requires multi-process test harness).

18. **Vercel Hobby 2-cron limit is fully consumed, no room for a 1-minute outbox cron** —
    current mitigation (fan-out from existing 2 crons) gives 5-minute tombstone latency
    worst-case. This breaches the §18.1 SLO (60 s p99 tombstone hide). Documented
    non-production-ready; Phase 10 launch hardening upgrades to Pro-plan cron or dedicated
    worker. Test coverage: none in Phase 02; flagged in README.

19. **Outbox table grows unbounded**: COMPLETED rows accumulate. Phase 02 adds a tail-retention
    policy in the `daily-maintenance` daily window (9:02-9:04 UTC): DELETE rows with
    `status='COMPLETED' AND created_at < NOW() - INTERVAL '14 days'`. DLQ rows never deleted.
    Test: `drain.test.ts::retention sweep deletes old COMPLETED rows; never deletes DLQ`.

20. **Geocode payload address differs from canonical address** (host re-submits with a typo):
    the write path canonicalizes to the SAME `physical_units` row (Phase 01 invariant); the
    outbox `GEOCODE_NEEDED` event payload carries the RAW address. If the second submit's raw
    address differs, the worker may geocode a different string. Mitigation: worker uses the
    canonical address reconstructed from `physical_units` columns if present, falling back to
    `payload.address` only on missing data. Test: `geocode-worker.test.ts::uses canonical
    address when available`.

21. **`SKIP LOCKED` claim followed by COMMIT crash** — the claim tx committed, so the row is
    now `IN_FLIGHT`; the processing tx never ran. Reaper (deferred Edge Case 14) reverts
    after 10 min. Documented; no test in Phase 02.

---

## Rollback

Per project memory (pre-launch dummy data), destructive migrations are safe. Rollback is manual
migration-by-migration via rollback SQL comments, matching Phase 01 precedent
(`phase-01-foundations-identity-lifecycle/spec.md` §Rollback).

### Sub-change 1: `20260502030000_phase02_cache_invalidations_enqueued_idx`

**Rollback**: `DROP INDEX IF EXISTS cache_invalidations_pending_enqueued_idx;`
Fully reversible; only an index.

### Sub-change 2: `20260502020000_phase02_listing_inventories_publish_status_check`

**Rollback**: `ALTER TABLE listing_inventories DROP CONSTRAINT
listing_inventories_publish_status_chk;`
Fully reversible; no data loss. Rows with non-enum values in `publish_status` would then pass
validation — acceptable because Phase 01 had no CHECK originally.

### Sub-change 3: `20260502010000_phase02_physical_units_geocode_columns`

**Rollback**:
```sql
ALTER TABLE physical_units DROP COLUMN public_area_name;
ALTER TABLE physical_units DROP COLUMN public_cell_id;
ALTER TABLE physical_units DROP COLUMN public_point;
ALTER TABLE physical_units DROP COLUMN exact_point;
```
Fully reversible; columns are nullable and empty (pre-launch). PostGIS extension is left
installed — safe to leave.

### Sub-change 4: `20260502000000_phase02_projection_tables`

**Rollback** (run as a single tx):
```sql
DROP TABLE IF EXISTS "unit_public_projection" CASCADE;
DROP TABLE IF EXISTS "inventory_search_projection" CASCADE;
```
Fully reversible pre-launch (empty tables). If rows have been written by the Phase 02 workers,
the DROP discards them — acceptable under dummy-data rules. If Phase 03+ code has already
landed and reads these tables, rollback must also revert that code via `git revert`.

### Sub-change 5: Prisma schema

**Rollback**: `git revert` the edit to `prisma/schema.prisma` (remove `InventorySearchProjection`,
`UnitPublicProjection` models + four `PhysicalUnit` fields), then `pnpm prisma generate`. No
DB effect on its own; must pair with sub-changes 3 + 4.

### Sub-change 6: Application code (projections, outbox drain, flags, cron route)

**Rollback**: `git revert` the commit adding `src/lib/projections/**`, `src/lib/outbox/drain.ts`,
`src/lib/outbox/handlers.ts`, `src/lib/outbox/dlq.ts`, `src/lib/flags/phase02.ts`,
`src/lib/metrics/projection-lag.ts`, `src/app/api/cron/outbox-drain/route.ts`, and the three
additive lines in `src/lib/identity/resolve-or-create-unit.ts`. Existing callers observe no
behavior change because:
- `phase02_projection_writes_enabled` defaults `false` — no drain runs without an explicit
  opt-in.
- The Phase 01 test `phase01-read-path-isolation.test.ts` still passes — Phase 02 code was
  invisible to the read path.

### Sub-change 7: Cron wiring edits

**Rollback**: revert the specific task additions inside
`src/app/api/cron/daily-maintenance/route.ts` and `src/app/api/cron/sweep-expired-holds/route.ts`
(3-5 lines each). Vercel cron fires continue to hit the existing routes; the outbox-drain
task block is simply removed. `vercel.json` does NOT need editing (no new cron entry is added
in Phase 02).

### Order of operations

1. Revert application code (sub-changes 5 + 6 + 7) — removes all TS callers that could write
   projection rows.
2. Revert sub-change 2 (drop publish_status CHECK) — unblocks any operator recovery writes.
3. Revert sub-change 3 (drop physical_units columns) — no longer needed once geocode worker
   is gone.
4. Revert sub-change 4 (drop projection tables) — final DDL cleanup.
5. Revert sub-change 1 (drop index) — last, cheapest revert.

Document this order in `.orchestrator/phases/phase-02-outbox-filter-projections/rollback-runbook.md`
if Phase 02 ships; otherwise the migration READMEs remain the authoritative source (Phase 01
precedent — deferred in `v3-review.json` line 40).

---

## Cited references

- Master plan §6.4 (published projections) — `.orchestrator/master-plan.md:201-207`
- Master plan §6.5 (operational tables) — `master-plan.md:208-214`
- Master plan §9.3 (publication pipeline) — `master-plan.md:379-385`
- Master plan §9.4 (publish state machine) — `master-plan.md:386-410`
- Master plan §13 (resource isolation) — `master-plan.md:589-638`
- Master plan §14 (queue topology) — `master-plan.md:639-701`
- Master plan §15 (kill switches) — `master-plan.md:702-753`
- Master plan §18 (observability + SLOs) — `master-plan.md:814-892`
- Master plan §21 (testing) — `master-plan.md:985-1003`
- Phase 01 shipped migration — `prisma/migrations/20260501000000_phase01_canonical_identity_tables/migration.sql:164-209`
- Phase 01 outbox append — `src/lib/outbox/append.ts:1-52`
- Phase 01 resolve-or-create — `src/lib/identity/resolve-or-create-unit.ts:41-117`
- Phase 01 mutate-unit — `src/lib/identity/mutate-unit.ts:77-203`
- Phase 01 v3 review — `.orchestrator/phases/phase-01-foundations-identity-lifecycle/attempts/v3-review.json`
- Cron auth pattern — `src/lib/cron-auth.ts:19-36`
- Existing cron dispatcher pattern — `src/app/api/cron/daily-maintenance/route.ts:1-80`
- Sweeper advisory-lock + SKIP LOCKED pattern — `src/app/api/cron/sweep-expired-holds/route.ts:1-30`
- Geocoding adapter — `src/lib/geocoding.ts:10-31`
- Retry utility — `src/lib/retry.ts:41-77`
- PGlite harness — `src/__tests__/utils/pglite-phase01.ts:1-987`
- Vercel cron manifest (Hobby 2-cron limit) — `vercel.json`
